import type { SupabaseClient } from "@supabase/supabase-js";

// Sign convention used throughout this file:
//   balance > 0  →  company OWES the owner (we're holding their money)
//   balance < 0  →  owner OWES the company (we covered more than we collected)

export type OwnerBalanceBreakdown = {
  openingBalance: number;
  rentReceivedToCompany: number;   // cash + bank_transfer payments on owner's properties
  rentReceivedDirectByCheque: number; // for transparency only — does NOT enter the balance
  commissionEarned: number;            // 9% on eligible rent (cash, transfer, AND cheque) for properties with commission_type='percentage'
  earlyTerminationCommissionCatchUp: number; // catch-up for leases that vacated before contract end — owner is still owed full-contract commission
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

  // Cutoff for what counts toward this snapshot. Opening balance has its own
  // date so we don't double-count anything that already preceded it — we only
  // sum activity strictly AFTER opening_balance_date.
  const openingDate = (owner.opening_balance_date as string) || "1970-01-01";

  // 3. Payments (rent collected) for the owner's properties.
  // Walk: payments → leases → units → property_id, plus pull the
  // unit-level commission override (e.g. one Bareeq Alshatti unit pays
  // 9% while the other is exempt) so we can resolve per-payment.
  // Skip the rent walk entirely when the owner has no properties yet — the
  // owner-level balance still works for opening balance + owner-level
  // expenses + business fees + settlements.
  const leaseUnitMap = new Map<string, string>(); // lease_id → unit_id
  const leasePropertyMap = new Map<string, string>(); // lease_id → property_id
  const unitCommissionMap = new Map<
    string,
    { type: string; rate: number } | null
  >(); // unit_id → override (or null when no override)
  if (propertyIds.length > 0) {
    const ownerUnitsRes = await supabase
      .from("units")
      .select("id, commission_type, commission_rate")
      .in("property_id", propertyIds);
    const ownerUnitIds = (ownerUnitsRes.data || []).map((u) => u.id as string);
    for (const u of ownerUnitsRes.data || []) {
      // Only stash a non-null override; NULL means "inherit property".
      if (u.commission_type) {
        unitCommissionMap.set(u.id as string, {
          type: u.commission_type as string,
          rate: Number(u.commission_rate || 0),
        });
      }
    }
    if (ownerUnitIds.length > 0) {
      const { data: leases } = await supabase
        .from("leases")
        .select("id, unit_id, units(id, property_id)")
        .in("unit_id", ownerUnitIds);
      for (const l of leases || []) {
        const u = pickJoined(l.units);
        if (u) {
          leasePropertyMap.set(l.id as string, u.property_id as string);
          leaseUnitMap.set(l.id as string, u.id as string);
        }
      }
    }
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
      const leaseId = p.lease_id as string;
      const unitId = leaseUnitMap.get(leaseId);
      const propId = leasePropertyMap.get(leaseId);
      // Unit-level override takes precedence; otherwise fall back to
      // the property-level commission setting.
      const unitOverride = unitId ? unitCommissionMap.get(unitId) : undefined;
      const config =
        unitOverride ?? (propId ? commissionByProperty.get(propId) : undefined);

      // Cash & bank transfer hit our account → we owe owner.
      // Cheques go direct to owner → no balance change for the rent itself.
      if (method === "cash" || method === "bank_transfer") {
        rentToCompany += amount;
      } else if (method === "cheque") {
        rentDirectCheque += amount;
      }

      // Commission applies to all rent for properties/units with
      // type=percentage, INCLUDING cheques (per the owner's rule:
      // 9% is owed regardless of payment channel for those units).
      if (config && config.type === "percentage" && config.rate > 0) {
        commissionEarned += amount * (config.rate / 100);
      }
      // For "included_in_business_fee" units: no per-payment commission;
      // the flat owner_business_fees row covers it.
      // For "none": no commission ever.
    }
  }

  // 3b. Early-termination commission catch-up.
  // When a tenant on a percentage-commission unit vacates before their
  // contract end_date, the owner is still owed commission on the
  // *remaining* months of the contract (months from vacate_date through
  // end_date). Per-payment commission already covers months actually paid;
  // this just catches the unpaid tail.
  //   catch_up_per_lease = months_remaining × monthly_rent × rate
  // Restricted to commission_type='percentage' — units on
  // included_in_business_fee or none are unaffected.
  // Skips leases whose vacate_date is on/before the owner's
  // opening_balance_date — those are already baked into the opening
  // balance and shouldn't generate fresh catch-up after-the-fact.
  let earlyTerminationCatchUp = 0;
  if (leaseIds.length > 0) {
    const { data: vacatedLeases } = await supabase
      .from("leases")
      .select("id, unit_id, start_date, end_date, vacate_date, monthly_rent")
      .in("id", leaseIds)
      .eq("is_active", false)
      .not("vacate_date", "is", null)
      .gt("vacate_date", openingDate);

    for (const lease of vacatedLeases || []) {
      const leaseId = lease.id as string;
      const endDate = lease.end_date as string;
      const vacateDate = lease.vacate_date as string;
      const monthlyRent = Number(lease.monthly_rent || 0);

      // Only counts as an early termination if the tenant left before the
      // original contract end_date. End-of-lease moves don't trigger.
      if (!(vacateDate < endDate)) continue;

      const unitId = lease.unit_id as string;
      const propId = leasePropertyMap.get(leaseId);
      const unitOverride = unitCommissionMap.get(unitId);
      const config =
        unitOverride ?? (propId ? commissionByProperty.get(propId) : undefined);
      if (!config || config.type !== "percentage" || config.rate <= 0) continue;

      const monthsRemaining = monthsInRange(vacateDate, endDate);
      if (monthsRemaining <= 0 || monthlyRent <= 0) continue;

      earlyTerminationCatchUp +=
        monthsRemaining * monthlyRent * (config.rate / 100);
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

  // 5. Expenses paid by the company. Two flavours:
  //   (a) tied to a specific property the owner owns
  //   (b) owner-level expenses (no property — most of this owner's actual
  //       bookkeeping looks like this since costs aren't allocated per
  //       building). These are matched directly via expenses.owner_id.
  // We do two queries and OR the results in JS rather than relying on
  // PostgREST's `or=` filter, which is awkward when one side is `in()`.
  const [propertyScopedRes, ownerScopedRes] = await Promise.all([
    propertyIds.length > 0
      ? supabase
          .from("expenses")
          .select("id, amount, expense_date")
          .in("property_id", propertyIds)
          .gt("expense_date", openingDate)
          .lte("expense_date", asOf)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("expenses")
      .select("id, amount, expense_date")
      .eq("owner_id", ownerId)
      .gt("expense_date", openingDate)
      .lte("expense_date", asOf),
  ]);
  // Dedup by id in case a row matches both predicates (unlikely — a row
  // is normally either property-scoped OR owner-scoped — but defensive).
  const expenseMap = new Map<string, number>();
  for (const e of propertyScopedRes.data || []) {
    expenseMap.set(e.id as string, Number(e.amount || 0));
  }
  for (const e of ownerScopedRes.data || []) {
    expenseMap.set(e.id as string, Number(e.amount || 0));
  }
  const expensesPaid = Array.from(expenseMap.values()).reduce(
    (s, n) => s + n,
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
    earlyTerminationCatchUp -
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
      earlyTerminationCommissionCatchUp: round2(earlyTerminationCatchUp),
      businessManagerFees: round2(businessFees),
      expensesCoveredByCompany: round2(expensesPaid),
      settlementsPaidToOwner: round2(paidToOwner),
      settlementsReceivedFromOwner: round2(receivedFromOwner),
      balance: round2(balance),
    },
  };
}

// ── Move-out preview ─────────────────────────────────────────────────────
// Helper used by the move-out UI to show "if you set vacate_date to X, the
// company is owed Y in commission" before the user confirms. Returns 0 for
// units that aren't on commission_type='percentage' (per the owner's rule —
// only percentage-commission units trigger early-termination commission).

export type EarlyTerminationCommissionPreview = {
  applicable: boolean;
  reason?: string;
  monthlyRent: number;
  contractMonths: number;
  remainingCommission: number;
  commissionRate: number;
  monthsRemainingAtVacate: number;
};

export async function getEarlyTerminationCommissionForLease(
  supabase: SupabaseClient,
  leaseId: string,
  vacateDate: string,
): Promise<EarlyTerminationCommissionPreview> {
  const empty: EarlyTerminationCommissionPreview = {
    applicable: false,
    monthlyRent: 0,
    contractMonths: 0,
    remainingCommission: 0,
    commissionRate: 0,
    monthsRemainingAtVacate: 0,
  };

  // Walk lease → unit → property to find the applicable commission config.
  const { data: lease } = await supabase
    .from("leases")
    .select(
      `
      id, start_date, end_date, monthly_rent, unit_id,
      units(id, commission_type, commission_rate, property_id,
        properties(id, commission_type, commission_rate, owner_id))
      `,
    )
    .eq("id", leaseId)
    .maybeSingle();
  if (!lease) return { ...empty, reason: "lease_not_found" };

  const monthlyRent = Number(lease.monthly_rent || 0);
  const startDate = lease.start_date as string;
  const endDate = lease.end_date as string;
  const unit = pickJoined(lease.units);
  const property = pickJoined(unit?.properties as unknown);
  const unitOverride =
    unit && unit.commission_type
      ? {
          type: unit.commission_type as string,
          rate: Number(unit.commission_rate || 0),
        }
      : undefined;
  const propertyConfig = property
    ? {
        type: (property.commission_type as string) || "none",
        rate: Number(property.commission_rate || 0),
      }
    : undefined;
  const config = unitOverride ?? propertyConfig;

  if (!config || config.type !== "percentage" || config.rate <= 0) {
    return {
      ...empty,
      monthlyRent,
      reason: "not_percentage_commission",
    };
  }

  // Only applicable when vacate_date is strictly before end_date — leaving
  // on or after the contract end is not an early termination.
  if (!(vacateDate < endDate)) {
    return {
      ...empty,
      monthlyRent,
      commissionRate: config.rate,
      reason: "not_early_termination",
    };
  }

  const contractMonths = monthsInRange(startDate, endDate);
  const monthsRemainingAtVacate = monthsInRange(vacateDate, endDate);
  if (monthsRemainingAtVacate <= 0 || monthlyRent <= 0) {
    return {
      ...empty,
      monthlyRent,
      commissionRate: config.rate,
      contractMonths,
    };
  }

  // Catch-up = unpaid future months × rent × rate. Per-payment commission
  // already covers the months actually collected on, so we only charge the
  // remaining (post-vacate) portion.
  const remainingCommission =
    monthsRemainingAtVacate * monthlyRent * (config.rate / 100);

  return {
    applicable: true,
    monthlyRent,
    contractMonths,
    remainingCommission: round2(remainingCommission),
    commissionRate: config.rate,
    monthsRemainingAtVacate,
  };
}

// Counts whole calendar months between two YYYY-MM-DD dates.
//   2026-01-01 → 2026-12-31 → 12
//   2026-01-15 → 2026-07-15 → 6
//   2026-01-15 → 2027-01-14 → 12
// Off-by-one edge cases (e.g. trailing day-of-month) round up to the next
// full period, which matches how rent invoices are billed monthly.
function monthsInRange(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  let months =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth());
  if (e.getUTCDate() > s.getUTCDate()) months += 1;
  return Math.max(0, months);
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
