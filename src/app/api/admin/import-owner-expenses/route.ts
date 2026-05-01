import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

// One-shot import endpoint for migrating historical owner expenses out
// of the user's Excel sheet into the `expenses` table. Guarded by
// CRON_SECRET so only the operator can call it.
//
// Usage:
//   curl -X POST https://<host>/api/admin/import-owner-expenses \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -F "file=@expenses.xlsx" \
//     -F "owner_id=<uuid>"            # optional if only one owner exists
//     -F "default_category=other"     # optional fallback category
//     -F "dry_run=true"               # preview without inserting
//
// Expected Excel columns (case-insensitive, trimmed; aliases accepted):
//   - date / expense_date / تاريخ              → expense_date (YYYY-MM-DD)
//   - property / property_name / عقار          → property name (matched ilike)
//   - description / desc / item / وصف          → description text
//   - amount / cost / value / المبلغ           → numeric amount in OMR
//   - category / cat / فئة (optional)          → expense_category enum value
//   - vendor / supplier / مورد (optional)      → vendor name
//   - unit / unit_number (optional)            → unit number within property

export const maxDuration = 60;

const CATEGORY_ALIASES: Record<string, string> = {
  maintenance: "maintenance",
  maint: "maintenance",
  repair: "maintenance",
  insurance: "insurance",
  utilities: "utilities",
  electric: "utilities",
  electricity: "utilities",
  water: "utilities",
  cleaning: "cleaning",
  legal: "legal",
  taxes: "taxes",
  tax: "taxes",
  management: "management_fees",
  management_fees: "management_fees",
  fee: "management_fees",
  other: "other",
  misc: "other",
};

const COLUMN_ALIASES: Record<string, string[]> = {
  expense_date: ["date", "expense_date", "expensedate", "تاريخ"],
  property_name: ["property", "property_name", "propertyname", "building", "عقار", "مبنى"],
  description: ["description", "desc", "item", "details", "وصف"],
  amount: ["amount", "cost", "value", "price", "المبلغ", "قيمة"],
  category: ["category", "cat", "type", "فئة", "نوع"],
  vendor: ["vendor", "supplier", "provider", "مورد"],
  unit_number: ["unit", "unit_number", "unitnumber", "وحدة"],
};

type RowResult = {
  row: number;
  status: "inserted" | "skipped" | "failed";
  reason?: string;
  expense_id?: string;
};

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing 'file' field (multipart/form-data with the Excel file)" },
      { status: 400 },
    );
  }

  let ownerId = (formData.get("owner_id") as string | null) || null;
  const defaultCategory =
    ((formData.get("default_category") as string | null) || "other").toLowerCase();
  const dryRun = (formData.get("dry_run") as string | null) === "true";

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Resolve owner if not given.
  if (!ownerId) {
    const { data: owners } = await supabase
      .from("owners")
      .select("id")
      .eq("is_active", true)
      .limit(2);
    if (!owners || owners.length === 0) {
      return NextResponse.json(
        { error: "No active owner found and owner_id was not supplied" },
        { status: 400 },
      );
    }
    if (owners.length > 1) {
      return NextResponse.json(
        { error: "Multiple owners exist; pass owner_id explicitly" },
        { status: 400 },
      );
    }
    ownerId = owners[0].id as string;
  }

  // Pull the owner's properties so we can match by name.
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("owner_id", ownerId);
  if (!properties || properties.length === 0) {
    return NextResponse.json(
      { error: `Owner ${ownerId} has no properties — assign properties first` },
      { status: 400 },
    );
  }
  const propertyByLowerName = new Map<string, string>(
    properties.map((p) => [(p.name as string).trim().toLowerCase(), p.id as string]),
  );
  const propertyByContains = (name: string): string | null => {
    const target = name.trim().toLowerCase();
    if (propertyByLowerName.has(target)) return propertyByLowerName.get(target)!;
    // Fuzzy: prefix or substring match — pick the shortest matching name to
    // avoid grabbing an over-broad property (e.g. "Tower" matching "Tower A"
    // and "Tower B" both — picks the more-specific one).
    let best: { id: string; len: number } | null = null;
    for (const [lower, id] of propertyByLowerName) {
      if (lower.includes(target) || target.includes(lower)) {
        if (!best || lower.length < best.len) best = { id, len: lower.length };
      }
    }
    return best?.id || null;
  };

  // Parse the workbook.
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return NextResponse.json({ error: "Workbook has no sheets" }, { status: 400 });
  }
  const sheet = workbook.Sheets[firstSheet];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: null,
  });
  if (rawRows.length === 0) {
    return NextResponse.json({ error: "Sheet has no data rows" }, { status: 400 });
  }

  // Build column → canonical map from the first row's keys.
  const headerKeys = Object.keys(rawRows[0]);
  const headerMap = new Map<string, string>(); // canonical → actual header
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = headerKeys.find((h) =>
      aliases.includes(h.trim().toLowerCase()),
    );
    if (match) headerMap.set(canonical, match);
  }
  for (const required of ["expense_date", "property_name", "amount"]) {
    if (!headerMap.has(required)) {
      return NextResponse.json(
        {
          error: `Missing required column '${required}'. Looked for: ${COLUMN_ALIASES[required].join(", ")}`,
          headers_found: headerKeys,
        },
        { status: 400 },
      );
    }
  }

  const results: RowResult[] = [];
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2; // +1 for header, +1 for 1-indexing

    const dateRaw = row[headerMap.get("expense_date")!];
    const propertyRaw = row[headerMap.get("property_name")!];
    const amountRaw = row[headerMap.get("amount")!];
    const descRaw = headerMap.get("description")
      ? row[headerMap.get("description")!]
      : null;
    const categoryRaw = headerMap.get("category")
      ? row[headerMap.get("category")!]
      : null;
    const vendorRaw = headerMap.get("vendor") ? row[headerMap.get("vendor")!] : null;

    // Skip blank-ish rows silently.
    if (!dateRaw && !propertyRaw && !amountRaw) continue;

    const expenseDate = normalizeDate(dateRaw);
    if (!expenseDate) {
      results.push({ row: rowNum, status: "failed", reason: "Invalid date" });
      failed++;
      continue;
    }

    const amount = Number(String(amountRaw || "").replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      results.push({ row: rowNum, status: "failed", reason: "Invalid amount" });
      failed++;
      continue;
    }

    const propertyName = String(propertyRaw || "").trim();
    if (!propertyName) {
      results.push({ row: rowNum, status: "failed", reason: "Missing property" });
      failed++;
      continue;
    }
    const propertyId = propertyByContains(propertyName);
    if (!propertyId) {
      results.push({
        row: rowNum,
        status: "skipped",
        reason: `Property '${propertyName}' not found`,
      });
      skipped++;
      continue;
    }

    const categoryStr = String(categoryRaw || defaultCategory)
      .trim()
      .toLowerCase();
    const category = CATEGORY_ALIASES[categoryStr] || defaultCategory;

    if (dryRun) {
      results.push({ row: rowNum, status: "inserted", reason: "(dry run)" });
      inserted++;
      continue;
    }

    const { data: inserted_row, error } = await supabase
      .from("expenses")
      .insert({
        property_id: propertyId,
        category,
        amount,
        expense_date: expenseDate,
        description: descRaw ? String(descRaw).trim() : null,
        vendor: vendorRaw ? String(vendorRaw).trim() : null,
      })
      .select("id")
      .single();

    if (error) {
      results.push({ row: rowNum, status: "failed", reason: error.message });
      failed++;
    } else {
      results.push({
        row: rowNum,
        status: "inserted",
        expense_id: inserted_row?.id as string,
      });
      inserted++;
    }
  }

  return NextResponse.json({
    sheet: firstSheet,
    total_rows: rawRows.length,
    inserted,
    skipped,
    failed,
    dry_run: dryRun,
    // Cap the per-row report so the response stays small for big sheets.
    results: results.slice(0, 200),
    truncated: results.length > 200,
  });
}

// Excel cells come through as either Date objects (cellDates: true) or
// strings — normalise both to YYYY-MM-DD. Returns null if unparseable.
function normalizeDate(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().split("T")[0];
  }
  const s = String(raw).trim();
  // Already ISO-ish: 2026-04-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(Date.UTC(year, Number(mo) - 1, Number(d)));
    if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0];
  }
  // Fallback: let Date parse it.
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0];
  return null;
}
