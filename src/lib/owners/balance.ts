import type { SupabaseClient } from "@supabase/supabase-js";

// Sign convention used throughout this file:
//   balance > 0  →  company OWES the owner (we're holding their money)
//   balance < 0  →  owner OWES the company (we covered more than we collected)

export type OwnerBalanceBreakdown = {
  openingBalance: number;
  rentReceivedToCompany: number;   // cash + bank_transfer payments on owner's properties
  rentReceivedDirectByCheque: number; // for transparency only — does NOT enter the balance
  commissionEarned: number;            // 9% on eligible rent (cash, transfer, AND cheque) for properties with commission_type='percentage'
  businessManagerFees: number;         // sum of owner_business_fees rows
  expensesCoveredByCompany: number;    // sum of expenses on owner's properties
  settlementsPaidToOwner: number;      // company_to_owner
  settlementsReceivedFromOwner: number; // owner_to_company
  balance: number;                     // signed final number
};

export type OwnerBalanceResult = {
  ownerId: string;
  ownerName: string;
  asOf: string;            // YYYY-MM-DD
  balance: number;
  side: "company_owes_owner" | "owner_owes_company" | "settled";
  breakdown: OwnerBalanceBreakdown;
};

// Query everything needed up to (and including) the asOf date, then sum.
// Cheap on this scale — single-owner systems with O(1000) payments and
// O(100) expenses fit comfortably in one round-trip per category.
export async function getOwnerBalance(
  supabase: SupabaseClient,
  ownerId: string,
  asOf: string = new Date().toISOString().split("T")[0],
): Promise<OwnerBalanceResult | null> {
  // 1. Owner record (opening balance + name).
  const { data: owner, error: ownerErr } = await supabase
    .from("owners")
    .select("id, name, opening_balance, opening_balance_date")
    .eq("id", ownerId)
    .single();
  if (ownerErr || !owner) return null;

  // 2. All properties belonging to this owner, with their commission config.
  // We need property_id to scope payments/expenses, plus commission_type/rate
  // so we can compute commission per payment.
  const { data: properties } = await supabase
    .from("properties")
    .select("id, commission_type, commission_rate")
    .eq("owner_id", ownerId);
  const propertyIds = (properties || []).map((p) => p.id as string);
  const commissionByProperty = new Map<
    string,
    { type: string; rate: number }
  >();
  for (const p of properties || []) {
    commissionByProperty.set(p.id as string, {
      type: (p.commission_type as string) || "none",
      rate: Number(p.commission_rate || 0),
    });
  }

  if (propertyIds.length === 0) {
    // Owner exists but has no properties — return opening balance only.
    const opening = Number(owner.opening_balance || 0);
    return {
      ownerId: owner.id as string,
      ownerName: owner.name as string,
      asOf,
      balance: opening,
      side: signedSide(opening),
      breakdown: {
        openingBalance: opening,
        rentReceivedToCompany: 0,
        rentReceivedDirectByCheque: 0,
        commissionEarned: 0,
        businessManagerFees: 0,
        expensesCoveredByCompany: 0,
        settlementsPaidToOwner: 0,
        settlementsReceivedFromOwner: 0,
        balance: opening,
      },
    };
  }

  // Cutoff for what counts toward this snapshot. Opening balance has its own
  // date so we don't double-count anything that already preceded it — we only
  // sum activity strictly AFTER opening_balance_date.
  const openingDate = (owner.opening_balance_date as string) || "1970-01-01";

  // 3. Payments (rent collected) for the owner's properties.
  // Need to walk: payments → leases → units → property_id.
  // Easiest in two hops: (a) all leases under our properties, then
  //   (b) all payments on those leases within the date window.
  const { data: leases } = await supabase
    .from("leases")
    .select("id, units(id, property_id)")
    .in(
      "unit_id",
      (
        await supabase
          .from("units")
          .select("id")
          .in("property_id", propertyIds)
      ).data?.map((u) => u.id as string) || [],
    );
  const leasePropertyMap = new Map<string, string>();
  for (const l of leases || []) {
    const u = pickJoined(l.units);
    if (u) leasePropertyMap.set(l.id as string, u.property_id as string);
  }
  const leaseIds = Array.from(leasePropertyMap.keys());

  let rentToCompany = 0;
  let rentDirectCheque = 0;
  let commissionEarned = 0;

  if (leaseIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("amount, method, lease_id, payment_date")
      .in("lease_id", leaseIds)
      .gt("payment_date", openingDate)
      .lte("payment_date", asOf);

    for (const p of payments || []) {
      const amount = Number(p.amount || 0);
      const method = (p.method as string) || "cash";
      const propId = leasePropertyMap.get(p.lease_id as string);
      const config = propId ? commissionByProperty.get(propId) : undefined;

      // Cash & bank transfer hit our account → we owe owner.
      // Cheques go direct to owner → no balance change for the rent itself.
      if (method === "cash" || method === "bank_transfer") {
        rentToCompany += amount;
      } else if (method === "cheque") {
        rentDirectCheque += amount;
      }

      // Commission applies to all rent for properties with type=percentage,
      // INCLUDING cheques (per the owner's rule: 9% is owed regardless of
      // payment channel for those properties).
      if (config && config.type === "percentage" && config.rate > 0) {
        commissionEarned += amount * (config.rate / 100);
      }
      // For "included_in_business_fee" properties: no per-payment commission;
      // the flat owner_business_fees row covers it.
      // For "none": no commission ever.
    }
  }

  // 4. Business-manager fees (one or more owner_business_fees rows).
  const { data: fees } = await supabase
    .from("owner_business_fees")
    .select("amount, period_month")
    .eq("owner_id", ownerId)
    .gt("period_month", openingDate)
    .lte("period_month", asOf);
  const businessFees = (fees || []).reduce(
    (s, f) => s + Number(f.amount || 0),
    0,
  );

  // 5. Expenses on the owner's properties (assumed paid by company).
  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount, expense_date")
    .in("property_id", propertyIds)
    .gt("expense_date", openingDate)
    .lte("expense_date", asOf);
  const expensesPaid = (expenses || []).reduce(
    (s, e) => s + Number(e.amount || 0),
    0,
  );

  // 6. Settlements between company and owner.
  const { data: settlements } = await supabase
    .from("owner_settlements")
    .select("amount, direction, settled_at")
    .eq("owner_id", ownerId)
    .gt("settled_at", openingDate)
    .lte("settled_at", asOf);
  let paidToOwner = 0;
  let receivedFromOwner = 0;
  for (const s of settlements || []) {
    const amount = Number(s.amount || 0);
    if (s.direction === "company_to_owner") paidToOwner += amount;
    else if (s.direction === "owner_to_company") receivedFromOwner += amount;
  }

  const opening = Number(owner.opening_balance || 0);
  const balance =
    opening +
    rentToCompany -
    commissionEarned -
    businessFees -
    expensesPaid -
    paidToOwner +
    receivedFromOwner;

  return {
    ownerId: owner.id as string,
    ownerName: owner.name as string,
    asOf,
    balance: round2(balance),
    side: signedSide(balance),
    breakdown: {
      openingBalance: round2(opening),
      rentReceivedToCompany: round2(rentToCompany),
      rentReceivedDirectByCheque: round2(rentDirectCheque),
      commissionEarned: round2(commissionEarned),
      businessManagerFees: round2(businessFees),
      expensesCoveredByCompany: round2(expensesPaid),
      settlementsPaidToOwner: round2(paidToOwner),
      settlementsReceivedFromOwner: round2(receivedFromOwner),
      balance: round2(balance),
    },
  };
}

// Convenience: when the system has exactly one active owner (the common case
// today), tools can call this without first asking the agent to look up an id.
export async function getDefaultOwnerBalance(
  supabase: SupabaseClient,
): Promise<OwnerBalanceResult | null> {
  const { data: owners } = await supabase
    .from("owners")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(2);
  if (!owners || owners.length === 0) return null;
  // If there are multiple owners, the caller must specify which one — return
  // null rather than guessing. Keeps the failure mode loud once a second
  // owner is added.
  if (owners.length > 1) return null;
  return getOwnerBalance(supabase, owners[0].id as string);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function signedSide(
  balance: number,
): "company_owes_owner" | "owner_owes_company" | "settled" {
  if (balance > 0.005) return "company_owes_owner";
  if (balance < -0.005) return "owner_owes_company";
  return "settled";
}

// Supabase joins return either an object or a single-element array depending
// on the FK shape — normalise both to an object | null.
function pickJoined(val: unknown): Record<string, unknown> | null {
  if (!val) return null;
  if (Array.isArray(val)) return (val[0] as Record<string, unknown>) || null;
  return val as Record<string, unknown>;
}
