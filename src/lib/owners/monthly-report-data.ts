import type { SupabaseClient } from "@supabase/supabase-js";
import { getOwnerBalance, type OwnerBalanceResult } from "./balance";

export type MonthlyReportExpense = {
  date: string;
  category: string;
  description: string;
  amount: number;
  vendor: string | null;
  propertyName: string | null;
};

// "Transfer" here means any movement of money this month between the company
// and the owner — either a recorded owner_settlements row (the company
// physically paid the owner, or vice versa) OR a tenant rent payment that
// effectively flows to one side: cheques go direct to the owner (Transfer to
// Owner), cash + bank-transfer land in the company account (Transfer to
// Company). Rent rows carry tenant / unit context so the owner can see which
// unit it relates to.
export type MonthlyReportTransfer = {
  date: string;
  direction: "company_to_owner" | "owner_to_company";
  amount: number;
  method: string;
  reference: string | null;
  source: "settlement" | "rent_payment";
  tenantName?: string | null;
  unitNumber?: string | null;
  // Property the rent came from. Null for owner-level settlement rows.
  propertyName?: string | null;
};

export type MonthlyReportDefaultedInvoice = {
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  owing: number;
  status: string;
  daysOverdue: number;
};

export type MonthlyReport = {
  ownerId: string;
  ownerName: string;
  whatsappPhone: string | null;
  email: string | null;
  generatedAt: string;
  monthLabel: string;     // e.g. "May 2026"
  monthStart: string;     // YYYY-MM-DD, 1st of current month
  asOf: string;           // YYYY-MM-DD, today
  balance: OwnerBalanceResult;
  expenses: MonthlyReportExpense[];
  expensesTotal: number;
  transfersToOwner: MonthlyReportTransfer[];
  transfersToOwnerTotal: number;
  transfersToCompany: MonthlyReportTransfer[];
  transfersToCompanyTotal: number;
  defaultedInvoices: MonthlyReportDefaultedInvoice[];
  defaultedTotal: number;
};

function firstOfMonth(asOf: Date): string {
  return `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Pulls everything needed to render a single owner's monthly-to-date PDF
// report: cumulative balance + all unpaid invoices on their properties
// (the "defaulted tenants" — drops off the report once paid) + this
// month's expenses and settlements (resets at month rollover).
export async function getOwnerMonthlyReport(
  supabase: SupabaseClient,
  ownerId: string,
  asOfInput?: Date,
): Promise<MonthlyReport | null> {
  // Use Muscat-local date so the cron firing at 13:00 UTC Thursday
  // (17:00 Muscat) reports on the correct calendar day if it ever
  // straddles midnight.
  const now = asOfInput ?? new Date();
  const muscatNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const asOf = ymd(muscatNow);
  const monthStart = firstOfMonth(muscatNow);

  // Pass monthStart so the balance breakdown is scoped to the current month
  // with a rolling opening balance (prior months' commission/charges are
  // absorbed into the opening figure instead of re-appearing every month).
  const balance = await getOwnerBalance(supabase, ownerId, asOf, { monthStart });
  if (!balance) return null;

  const { data: owner } = await supabase
    .from("owners")
    .select("name, whatsapp_phone, email")
    .eq("id", ownerId)
    .single();

  const ownerProps = await supabase
    .from("properties")
    .select("id, name")
    .eq("owner_id", ownerId);
  const propertyIds = (ownerProps.data || []).map((p) => p.id as string);
  const propertyNames = new Map<string, string>();
  for (const p of ownerProps.data || []) {
    propertyNames.set(p.id as string, (p.name as string) || "?");
  }

  // Expenses for this month — owner-level OR on one of their properties.
  // Mirrors the balance logic in src/lib/owners/balance.ts.
  const [propExpensesRes, ownerExpensesRes] = await Promise.all([
    propertyIds.length > 0
      ? supabase
          .from("expenses")
          .select("amount, expense_date, category, description, vendor, property_id")
          .in("property_id", propertyIds)
          .gte("expense_date", monthStart)
          .lte("expense_date", asOf)
          .order("expense_date", { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    supabase
      .from("expenses")
      .select("amount, expense_date, category, description, vendor, property_id")
      .eq("owner_id", ownerId)
      .gte("expense_date", monthStart)
      .lte("expense_date", asOf)
      .order("expense_date", { ascending: true }),
  ]);

  // Same expense can show up in both queries (owner_id set AND property_id
  // set). De-dupe on (date, amount, category, description) to avoid double
  // counting in the report.
  const expenseSeen = new Set<string>();
  const expenses: MonthlyReportExpense[] = [];
  for (const row of [
    ...(propExpensesRes.data || []),
    ...(ownerExpensesRes.data || []),
  ] as Record<string, unknown>[]) {
    const key = `${row.expense_date}|${row.amount}|${row.category}|${row.description ?? ""}|${row.property_id ?? ""}`;
    if (expenseSeen.has(key)) continue;
    expenseSeen.add(key);
    expenses.push({
      date: row.expense_date as string,
      category: (row.category as string) || "other",
      description: (row.description as string) || "",
      amount: Number(row.amount || 0),
      vendor: (row.vendor as string) || null,
      propertyName: row.property_id
        ? propertyNames.get(row.property_id as string) || null
        : null,
    });
  }
  // Each underlying query is ordered by expense_date, but spreading
  // [...prop, ...owner] interleaves them by query-source rather than date.
  // Sort descending so the table reads most-recent first (newest expense at
  // the top, oldest at the bottom).
  expenses.sort((a, b) => b.date.localeCompare(a.date));
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);

  // Transfers this month, bucketed by which side ended up holding the money.
  //   Transfers to Owner   — cheque rent (direct to owner) + company→owner settlements
  //   Transfers to Company — cash/bank-transfer rent (to company) + owner→company settlements
  // Both streams are listed in the same table so the owner sees a single
  // chronological view of money movement per side.
  const transfersToOwner: MonthlyReportTransfer[] = [];
  const transfersToCompany: MonthlyReportTransfer[] = [];

  const settlementsRes = await supabase
    .from("owner_settlements")
    .select("amount, direction, method, settled_at, reference_number")
    .eq("owner_id", ownerId)
    .gte("settled_at", monthStart)
    .lte("settled_at", asOf)
    .order("settled_at", { ascending: true });
  for (const row of (settlementsRes.data || []) as Record<string, unknown>[]) {
    const entry: MonthlyReportTransfer = {
      date: row.settled_at as string,
      direction: row.direction as MonthlyReportTransfer["direction"],
      amount: Number(row.amount || 0),
      method: (row.method as string) || "cash",
      reference: (row.reference_number as string) || null,
      source: "settlement",
    };
    if (entry.direction === "company_to_owner") transfersToOwner.push(entry);
    else transfersToCompany.push(entry);
  }

  // Rent payments on the owner's leases this month. Walk
  // properties → units → leases → payments, mirroring the rent walk in
  // balance.ts. Each row carries tenant + unit + property context so the PDF
  // can group transfers by property.
  if (propertyIds.length > 0) {
    const ownerUnitsRes = await supabase
      .from("units")
      .select("id, unit_number, property_id")
      .in("property_id", propertyIds);
    const unitInfo = new Map<string, { unitNumber: string; propertyId: string }>();
    for (const u of ownerUnitsRes.data || []) {
      unitInfo.set(u.id as string, {
        unitNumber: (u.unit_number as string) || "?",
        propertyId: u.property_id as string,
      });
    }
    const unitIds = Array.from(unitInfo.keys());
    if (unitIds.length > 0) {
      const { data: leases } = await supabase
        .from("leases")
        .select("id, unit_id, tenants(full_name)")
        .in("unit_id", unitIds);
      const leaseContext = new Map<
        string,
        { unitId: string; tenantName: string }
      >();
      for (const l of leases || []) {
        const tRaw = l.tenants as unknown;
        const tenant = (Array.isArray(tRaw) ? tRaw[0] : tRaw) as
          | { full_name?: string }
          | null;
        leaseContext.set(l.id as string, {
          unitId: l.unit_id as string,
          tenantName: tenant?.full_name || "Unknown",
        });
      }
      const leaseIds = Array.from(leaseContext.keys());
      if (leaseIds.length > 0) {
        const { data: payments } = await supabase
          .from("payments")
          .select("amount, method, payment_date, reference_number, lease_id")
          .in("lease_id", leaseIds)
          .gte("payment_date", monthStart)
          .lte("payment_date", asOf)
          .order("payment_date", { ascending: true });
        for (const p of payments || []) {
          const ctx = leaseContext.get(p.lease_id as string);
          const unit = ctx ? unitInfo.get(ctx.unitId) : undefined;
          const method = (p.method as string) || "cash";
          const entry: MonthlyReportTransfer = {
            date: p.payment_date as string,
            // Cheque rent is direct-to-owner ⇒ company_to_owner conceptually;
            // cash/transfer rent lands in the company ⇒ owner_to_company.
            direction: method === "cheque" ? "company_to_owner" : "owner_to_company",
            amount: Number(p.amount || 0),
            method,
            reference: (p.reference_number as string) || null,
            source: "rent_payment",
            tenantName: ctx?.tenantName || null,
            unitNumber: unit?.unitNumber || null,
            propertyName: unit ? propertyNames.get(unit.propertyId) || null : null,
          };
          if (method === "cheque") transfersToOwner.push(entry);
          else transfersToCompany.push(entry);
        }
      }
    }
  }

  // Descending so each Transfers table reads most-recent first, matching the
  // expenses table above.
  transfersToOwner.sort((a, b) => b.date.localeCompare(a.date));
  transfersToCompany.sort((a, b) => b.date.localeCompare(a.date));
  const transfersToOwnerTotal = transfersToOwner.reduce((s, e) => s + e.amount, 0);
  const transfersToCompanyTotal = transfersToCompany.reduce((s, e) => s + e.amount, 0);

  // Defaulted tenants — every unpaid invoice across the owner's units,
  // regardless of the month it's from. Once an invoice is fully paid its
  // status flips to 'paid' and it falls off the next report.
  const defaultedInvoices: MonthlyReportDefaultedInvoice[] = [];
  let defaultedTotal = 0;
  if (propertyIds.length > 0) {
    const ownerUnitsRes = await supabase
      .from("units")
      .select("id")
      .in("property_id", propertyIds);
    const unitIds = (ownerUnitsRes.data || []).map((u) => u.id as string);
    if (unitIds.length > 0) {
      const invRes = await supabase
        .from("invoices")
        .select(
          "amount, paid_amount, due_date, status, " +
            "tenants(full_name), " +
            "units(unit_number, properties:property_id(name))"
        )
        .in("unit_id", unitIds)
        .in("status", ["pending", "partial", "overdue"])
        // Most-recent due date first so the outstanding table reads newest → oldest.
        .order("due_date", { ascending: false });
      for (const row of (invRes.data as unknown as Record<string, unknown>[] | null) || []) {
        const amount = Number(row.amount || 0);
        const paid = Number(row.paid_amount || 0);
        const owing = amount - paid;
        if (owing <= 0.005) continue;
        const tenant = row.tenants as Record<string, unknown> | null;
        const unit = row.units as Record<string, unknown> | null;
        const property = unit?.properties as Record<string, unknown> | null;
        const dueDate = row.due_date as string;
        const days = Math.max(
          0,
          Math.floor(
            (Date.parse(asOf) - Date.parse(dueDate)) / (1000 * 60 * 60 * 24),
          ),
        );
        // A tenant only counts as "defaulted" once they're more than 30
        // days past due. Anything within the 30-day grace window is still
        // collectable as normal and shouldn't be flagged to the owner.
        if (days <= 30) continue;
        defaultedInvoices.push({
          tenantName: (tenant?.full_name as string) || "Unknown",
          propertyName: (property?.name as string) || "?",
          unitNumber: (unit?.unit_number as string) || "?",
          dueDate,
          amount,
          paidAmount: paid,
          owing,
          status: row.status as string,
          daysOverdue: days,
        });
        defaultedTotal += owing;
      }
    }
  }

  const monthLabel = muscatNow.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return {
    ownerId,
    ownerName: (owner?.name as string) || balance.ownerName,
    whatsappPhone: (owner?.whatsapp_phone as string) || null,
    email: (owner?.email as string) || null,
    generatedAt: new Date().toISOString(),
    monthLabel,
    monthStart,
    asOf,
    balance,
    expenses,
    expensesTotal,
    transfersToOwner,
    transfersToOwnerTotal,
    transfersToCompany,
    transfersToCompanyTotal,
    defaultedInvoices,
    defaultedTotal,
  };
}
