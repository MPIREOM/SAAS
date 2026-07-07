import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getOwnerBalance, muscatMonthWindow } from "@/lib/owners/balance";
import { OwnerDetailView } from "@/components/owners/owner-detail-view";
import type { ExpenseRow } from "@/components/owners/types";

// Window for "recent" activity rendered in the Activity tab. Earlier
// rows are still queryable via the date filter inside the client view,
// but loading 18 months of history on every render is wasteful.
const ACTIVITY_WINDOW_DAYS = 90;

export default async function OwnerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
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

  // Live balance using the same calc the daily summary + agent rely on.
  // Scoped to the current Muscat month (same view as the monthly report):
  // the breakdown's opening balance is the previous month's closing balance
  // rolled over, not the genesis opening_balance snapshot. The headline
  // `balance` stays cumulative either way.
  const { asOf, monthStart } = muscatMonthWindow();
  const balance = await getOwnerBalance(supabase, id, asOf, { monthStart });

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
      activityWindowDays={ACTIVITY_WINDOW_DAYS}
    />
  );
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
