import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getOwnerBalance, muscatMonthWindow } from "@/lib/owners/balance";
import { OwnerDetailView } from "@/components/owners/owner-detail-view";
import type { ExpenseRow, OwnerMonthAnalysis } from "@/components/owners/types";

// Window for "recent" activity rendered in the Activity tab. Earlier
// rows are still queryable via the date filter inside the client view,
// but loading 18 months of history on every render is wasteful.
const ACTIVITY_WINDOW_DAYS = 90;

export default async function OwnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { month: monthParam } = await searchParams;
  const supabase = await createClient();

  const [ownerRes, propertiesRes, businessFeesRes, settlementsRes] =
    await Promise.all([
      supabase.from("owners").select("*").eq("id", id).single(),
      supabase
        .from("properties")
        .select("id, name, location, total_units, commission_type, commission_rate")
        .eq("owner_id", id)
        .order("name"),
      supabase
        .from("owner_business_fees")
        .select("id, period_month, amount, notes, created_at")
        .eq("owner_id", id)
        .order("period_month", { ascending: false }),
      supabase
        .from("owner_settlements")
        .select(
          "id, direction, amount, method, settled_at, reference_number, notes, created_at",
        )
        .eq("owner_id", id)
        .order("settled_at", { ascending: false }),
    ]);

  if (ownerRes.error || !ownerRes.data) {
    notFound();
  }

  const owner = ownerRes.data;
  const properties = propertiesRes.data || [];
  const propertyIds = properties.map((p) => p.id as string);
  const businessFees = businessFeesRes.data || [];
  const settlements = settlementsRes.data || [];

  // All units of the owner's properties (for commission overrides).
  const { data: units } = propertyIds.length
    ? await supabase
        .from("units")
        .select(
          "id, property_id, unit_number, status, rent_amount, commission_type, commission_rate",
        )
        .in("property_id", propertyIds)
        .order("unit_number")
    : { data: [] };

  // Recent payments + expenses for the activity timeline. Anything before
  // openingBalanceDate is implicitly excluded by the balance calc; we still
  // surface it here so the user can see context if they widen the filter.
  const sinceDate = sinceDateString(ACTIVITY_WINDOW_DAYS);

  const [unitsForLeasesRes, expensesPropRes, expensesOwnerRes] =
    await Promise.all([
      propertyIds.length
        ? supabase
            .from("units")
            .select("id")
            .in("property_id", propertyIds)
        : Promise.resolve({ data: [] }),
      propertyIds.length
        ? supabase
            .from("expenses")
            .select(
              "id, amount, category, description, expense_date, vendor, property_id, owner_id, properties:property_id(name)",
            )
            .in("property_id", propertyIds)
            .gte("expense_date", sinceDate)
            .order("expense_date", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from("expenses")
        .select(
          "id, amount, category, description, expense_date, vendor, property_id, owner_id, properties:property_id(name)",
        )
        .eq("owner_id", id)
        .gte("expense_date", sinceDate)
        .order("expense_date", { ascending: false }),
    ]);

  const ownerUnitIds = (unitsForLeasesRes.data || []).map((u) => u.id as string);

  const { data: leases } = ownerUnitIds.length
    ? await supabase
        .from("leases")
        .select("id, unit_id, units(id, property_id, unit_number, properties:property_id(name)), tenants(id, full_name)")
        .in("unit_id", ownerUnitIds)
    : { data: [] };

  const leaseIds = (leases || []).map((l) => l.id as string);

  const { data: payments } = leaseIds.length
    ? await supabase
        .from("payments")
        .select("id, lease_id, amount, method, payment_date, reference_number, notes")
        .in("lease_id", leaseIds)
        .gte("payment_date", sinceDate)
        .order("payment_date", { ascending: false })
    : { data: [] };

  // Merge property + owner-level expenses, deduping on id. The shape from
  // Supabase isn't statically typed here, so we cast to ExpenseRow at the
  // boundary — the consuming client component only reads a small subset.
  const expensesById = new Map<string, ExpenseRow>();
  for (const e of (expensesPropRes.data || []) as ExpenseRow[]) {
    expensesById.set(e.id, e);
  }
  for (const e of (expensesOwnerRes.data || []) as ExpenseRow[]) {
    expensesById.set(e.id, e);
  }
  const expenses = Array.from(expensesById.values()).sort((a, b) =>
    b.expense_date.localeCompare(a.expense_date),
  );

  // Statement month selection (?month=YYYY-MM). Defaults to the current
  // Muscat month; clamped between the ledger start month and today so a
  // stale or hand-edited URL can't request a window with no data.
  const { asOf: liveAsOf, monthStart: currentMonthStart } = muscatMonthWindow();
  const maxMonth = currentMonthStart.slice(0, 7);
  const minMonth = ((owner.opening_balance_date as string) || maxMonth).slice(0, 7);
  let selectedMonth =
    typeof monthParam === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)
      ? monthParam
      : maxMonth;
  if (selectedMonth > maxMonth) selectedMonth = maxMonth;
  if (selectedMonth < minMonth) selectedMonth = minMonth;
  const isCurrentMonth = selectedMonth === maxMonth;
  const monthStart = `${selectedMonth}-01`;
  // Past months close on their last day; the current month runs to today.
  const monthAsOf = isCurrentMonth ? liveAsOf : lastDayOfMonth(selectedMonth);
  const prevMonth = shiftMonth(selectedMonth, -1);
  const hasPrevMonth = prevMonth >= minMonth;

  // Same cutoffs the balance calc applies, so the analysis aggregates below
  // (rent by method, expenses by category) match the breakdown's numbers.
  const openingDate = (owner.opening_balance_date as string) || "1970-01-01";
  const rentExcludedUntil = (owner.rent_excluded_until as string | null) || null;

  // Balance for the selected month (same calc the daily summary + agent rely
  // on, scoped so the breakdown's opening balance is the previous month's
  // closing balance rolled over), the always-current balance for the
  // headline, the previous month's view for deltas, and the raw month rows
  // the analysis card groups by category / payment method.
  const [
    balance,
    liveBalanceRes,
    prevBalance,
    monthPaymentsRes,
    monthExpensesPropRes,
    monthExpensesOwnerRes,
  ] = await Promise.all([
    getOwnerBalance(supabase, id, monthAsOf, { monthStart }),
    isCurrentMonth ? Promise.resolve(null) : getOwnerBalance(supabase, id, liveAsOf),
    hasPrevMonth
      ? getOwnerBalance(supabase, id, lastDayOfMonth(prevMonth), {
          monthStart: `${prevMonth}-01`,
        })
      : Promise.resolve(null),
    leaseIds.length
      ? supabase
          .from("payments")
          .select("amount, method, payment_date")
          .in("lease_id", leaseIds)
          .gt("payment_date", openingDate)
          .gte("payment_date", monthStart)
          .lte("payment_date", monthAsOf)
      : Promise.resolve({ data: [] }),
    propertyIds.length
      ? supabase
          .from("expenses")
          .select("id, amount, category, expense_date")
          .in("property_id", propertyIds)
          .gt("expense_date", openingDate)
          .gte("expense_date", monthStart)
          .lte("expense_date", monthAsOf)
      : Promise.resolve({ data: [] }),
    supabase
      .from("expenses")
      .select("id, amount, category, expense_date")
      .eq("owner_id", id)
      .gt("expense_date", openingDate)
      .gte("expense_date", monthStart)
      .lte("expense_date", monthAsOf),
  ]);
  const liveBalance = isCurrentMonth
    ? balance && { balance: balance.balance, asOf: balance.asOf }
    : liveBalanceRes && {
        balance: liveBalanceRes.balance,
        asOf: liveBalanceRes.asOf,
      };

  // Rent collected this month, grouped by payment method. Cash/transfer rent
  // already absorbed into the opening balance (rent_excluded_until) is
  // skipped, mirroring the balance calc; cheques are direct-to-owner and
  // listed for reference either way.
  const rentAgg = new Map<string, { amount: number; count: number }>();
  for (const p of monthPaymentsRes.data || []) {
    const method = (p.method as string) || "cash";
    const paymentDate = p.payment_date as string;
    if (
      (method === "cash" || method === "bank_transfer") &&
      rentExcludedUntil !== null &&
      paymentDate <= rentExcludedUntil
    ) {
      continue;
    }
    const bucket = rentAgg.get(method) || { amount: 0, count: 0 };
    bucket.amount += Number(p.amount || 0);
    bucket.count += 1;
    rentAgg.set(method, bucket);
  }
  const rentByMethod = ["cash", "bank_transfer", "cheque"]
    .filter((m) => rentAgg.has(m))
    .map((m) => ({ method: m, amount: round2(rentAgg.get(m)!.amount), count: rentAgg.get(m)!.count }));

  // Expenses this month grouped by category (property- + owner-scoped rows,
  // deduped by id like the balance calc).
  const monthExpenseById = new Map<string, { amount: number; category: string }>();
  for (const e of [
    ...(monthExpensesPropRes.data || []),
    ...(monthExpensesOwnerRes.data || []),
  ]) {
    monthExpenseById.set(e.id as string, {
      amount: Number(e.amount || 0),
      category: (e.category as string) || "other",
    });
  }
  const categoryAgg = new Map<string, { amount: number; count: number }>();
  for (const { amount, category } of monthExpenseById.values()) {
    const bucket = categoryAgg.get(category) || { amount: 0, count: 0 };
    bucket.amount += amount;
    bucket.count += 1;
    categoryAgg.set(category, bucket);
  }
  const expensesByCategory = Array.from(categoryAgg.entries())
    .map(([category, agg]) => ({ category, amount: round2(agg.amount), count: agg.count }))
    .sort((a, b) => b.amount - a.amount);

  const monthAnalysis: OwnerMonthAnalysis | null = balance
    ? {
        month: selectedMonth,
        ...creditsAndCharges(balance.breakdown),
        closingBalance: balance.breakdown.balance,
        expensesByCategory,
        rentByMethod,
        prev: prevBalance ? creditsAndCharges(prevBalance.breakdown) : null,
      }
    : null;

  // Build a lease info map for the activity timeline so we can show
  // "Tenant — Unit (Property)" without an extra round-trip per row.
  type LeaseInfo = {
    tenantName: string;
    unitNumber: string;
    propertyName: string;
  };
  const leaseInfo: Record<string, LeaseInfo> = {};
  for (const l of leases || []) {
    const u = pickJoined(l.units);
    const t = pickJoined(l.tenants);
    const prop = u ? pickJoined(u.properties) : null;
    leaseInfo[l.id as string] = {
      tenantName: (t?.full_name as string) || "?",
      unitNumber: (u?.unit_number as string) || "?",
      propertyName: (prop?.name as string) || "?",
    };
  }

  return (
    <OwnerDetailView
      owner={owner}
      properties={properties}
      units={units || []}
      businessFees={businessFees}
      settlements={settlements}
      payments={payments || []}
      expenses={expenses}
      leaseInfo={leaseInfo}
      balance={balance}
      liveBalance={liveBalance}
      monthAnalysis={monthAnalysis}
      selectedMonth={selectedMonth}
      minMonth={minMonth}
      maxMonth={maxMonth}
      activityWindowDays={ACTIVITY_WINDOW_DAYS}
    />
  );
}

// Last calendar day of a YYYY-MM month. Date.UTC(y, m, 0) is day 0 of the
// FOLLOWING month, i.e. the last day of month m (1-indexed here).
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().split("T")[0];
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Collapses a month-scoped breakdown into the analysis card's three headline
// figures. credits − charges always equals closing − opening for the window.
function creditsAndCharges(b: {
  rentReceivedToCompany: number;
  settlementsReceivedFromOwner: number;
  commissionEarned: number;
  earlyTerminationCommissionCatchUp: number;
  businessManagerFees: number;
  expensesCoveredByCompany: number;
  settlementsPaidToOwner: number;
}): { credits: number; charges: number; netChange: number } {
  const credits = b.rentReceivedToCompany + b.settlementsReceivedFromOwner;
  const charges =
    b.commissionEarned +
    b.earlyTerminationCommissionCatchUp +
    b.businessManagerFees +
    b.expensesCoveredByCompany +
    b.settlementsPaidToOwner;
  return {
    credits: round2(credits),
    charges: round2(charges),
    netChange: round2(credits - charges),
  };
}

function pickJoined(val: unknown): Record<string, unknown> | null {
  if (!val) return null;
  if (Array.isArray(val)) return (val[0] as Record<string, unknown>) || null;
  return val as Record<string, unknown>;
}

// Wrapping the impure Date.now() call in a helper keeps the page body itself
// pure for the React purity lint while still resolving "today" per request.
function sinceDateString(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}
