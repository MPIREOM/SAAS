import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { checkBearer } from "@/lib/crypto/safe-compare";

// One-shot import endpoint for migrating historical expenses out of the
// operator's Excel sheet (`weekly expenses report DATA.xlsx`) into the
// `expenses` table. Guarded by CRON_SECRET so only the operator can run
// it.
//
// The actual sheet has no property dimension — every row is owner-level —
// so by default rows are imported with owner_id set and property_id null.
// Pass property_name in the sheet (or the column doesn't exist at all)
// and we'll attempt to resolve it; otherwise we attribute to the owner.
//
// The sheet's "Category" column doubles as a ledger-event marker for
// rows like `business manager fee`, `Commission fee`, `paid by owner to
// MPIRE`, and `pending amount to MPIRE`. Those rows are skipped here —
// the new system handles fees / commissions / settlements / balances
// natively, and re-importing them would double-count.
//
// Usage:
//   curl -X POST https://<host>/api/admin/import-owner-expenses \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -F "file=@expenses.xlsx" \
//     -F "owner_id=<uuid>"            # optional if only one owner exists
//     -F "default_category=other"     # fallback category for rows with no
//                                      # mapping
//     -F "since=2026-05-01"           # optional: only import rows on/after
//                                      # this date
//     -F "dry_run=true"               # preview without inserting

export const maxDuration = 60;

// Maps both English and the operator's actual sheet wording to our enum.
const CATEGORY_ALIASES: Record<string, string> = {
  // Generic English
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
  // Specific to the operator's existing sheet
  "repair & maintnance": "maintenance",
  "repair & maintenance": "maintenance",
  "general expenses": "other",
  "private expenses": "other",
  salary: "other",
  "municipality fee": "taxes",
  "garbage disposal": "cleaning",
};

// Categories that are NOT real expenses — these map to other tables in
// the new system (or are pure ledger snapshots) and must NOT be imported
// as expense rows or the running balance will double-count.
const SKIP_CATEGORIES = new Set([
  "business manager fee",
  "personal management fee",
  "commission fee",
  "rental commission",
  "paid by owner to mpire",
  "pending amount to mpire",
]);

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
  if (!checkBearer(auth, process.env.CRON_SECRET)) {
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
  const since = (formData.get("since") as string | null) || null;

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

  // Pull the owner's properties for optional name-matching. Doesn't error
  // when there are zero — owner-level imports are the common case.
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("owner_id", ownerId);
  const propertyByLowerName = new Map<string, string>(
    (properties || []).map((p) => [
      (p.name as string).trim().toLowerCase(),
      p.id as string,
    ]),
  );
  const propertyByContains = (name: string): string | null => {
    const target = name.trim().toLowerCase();
    if (propertyByLowerName.has(target)) return propertyByLowerName.get(target)!;
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
  const headerMap = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = headerKeys.find((h) =>
      aliases.includes(h.trim().toLowerCase()),
    );
    if (match) headerMap.set(canonical, match);
  }
  // Only date and amount are strictly required now — property is optional.
  for (const required of ["expense_date", "amount"]) {
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
    const amountRaw = row[headerMap.get("amount")!];
    const propertyRaw = headerMap.get("property_name")
      ? row[headerMap.get("property_name")!]
      : null;
    const descRaw = headerMap.get("description")
      ? row[headerMap.get("description")!]
      : null;
    const categoryRaw = headerMap.get("category")
      ? row[headerMap.get("category")!]
      : null;
    const vendorRaw = headerMap.get("vendor") ? row[headerMap.get("vendor")!] : null;

    // Skip blank-ish rows silently.
    if (!dateRaw && !amountRaw && !descRaw) continue;

    // Skip ledger-event categories (commissions / fees / settlements /
    // balance snapshots).
    const categoryLower = String(categoryRaw || "").trim().toLowerCase();
    if (
      [...SKIP_CATEGORIES].some(
        (s) => categoryLower === s || categoryLower.includes(s),
      )
    ) {
      results.push({
        row: rowNum,
        status: "skipped",
        reason: `Ledger event '${categoryRaw}' — handled natively, not imported`,
      });
      skipped++;
      continue;
    }

    const expenseDate = normalizeDate(dateRaw);
    if (!expenseDate) {
      results.push({ row: rowNum, status: "failed", reason: "Invalid date" });
      failed++;
      continue;
    }

    if (since && expenseDate < since) {
      results.push({
        row: rowNum,
        status: "skipped",
        reason: `Before since=${since}`,
      });
      skipped++;
      continue;
    }

    const amount = Number(String(amountRaw || "").replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      results.push({ row: rowNum, status: "failed", reason: "Invalid amount" });
      failed++;
      continue;
    }

    // Property is optional — when absent, attribute to the owner.
    let propertyId: string | null = null;
    if (propertyRaw) {
      const propertyName = String(propertyRaw).trim();
      if (propertyName) {
        propertyId = propertyByContains(propertyName);
        if (!propertyId) {
          // Fall through to owner-level rather than failing the row.
          results.push({
            row: rowNum,
            status: "skipped",
            reason: `Property '${propertyName}' not found — falling back to owner-level`,
          });
          // Don't increment skipped — we'll still insert; this is just a
          // diagnostic note.
        }
      }
    }

    const categoryStr = String(categoryRaw || defaultCategory).trim().toLowerCase();
    const category = CATEGORY_ALIASES[categoryStr] || defaultCategory;

    if (dryRun) {
      results.push({ row: rowNum, status: "inserted", reason: "(dry run)" });
      inserted++;
      continue;
    }

    const payload: Record<string, unknown> = {
      owner_id: ownerId,
      category,
      amount,
      expense_date: expenseDate,
      description: descRaw ? String(descRaw).trim() : null,
      vendor: vendorRaw ? String(vendorRaw).trim() : null,
    };
    if (propertyId) payload.property_id = propertyId;

    const { data: insertedRow, error } = await supabase
      .from("expenses")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      results.push({ row: rowNum, status: "failed", reason: error.message });
      failed++;
    } else {
      results.push({
        row: rowNum,
        status: "inserted",
        expense_id: insertedRow?.id as string,
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
    since: since || null,
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
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(Date.UTC(year, Number(mo) - 1, Number(d)));
    if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0];
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0];
  return null;
}
