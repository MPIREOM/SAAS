// Shared shapes for the owner detail page. Kept loose (Record<string, unknown>
// for joined rows) because each panel only consumes a small slice and we
// don't have first-class generated types from the DB yet.

import type { OwnerBalanceResult } from "@/lib/owners/balance";

export type Owner = {
  id: string;
  name: string;
  whatsapp_phone: string | null;
  email: string | null;
  language_preference: "en" | "ar";
  opening_balance: string | number;
  opening_balance_date: string;
  notes: string | null;
  is_active: boolean;
};

export type PropertyRow = {
  id: string;
  name: string;
  location: string | null;
  total_units: number | null;
  commission_type: "percentage" | "included_in_business_fee" | "none";
  commission_rate: string | number;
};

export type UnitRow = {
  id: string;
  property_id: string;
  unit_number: string;
  status: string;
  rent_amount: string | number;
  commission_type: "percentage" | "included_in_business_fee" | "none" | null;
  commission_rate: string | number | null;
};

export type BusinessFeeRow = {
  id: string;
  period_month: string;
  amount: string | number;
  notes: string | null;
  created_at: string;
};

export type SettlementRow = {
  id: string;
  direction: "company_to_owner" | "owner_to_company";
  amount: string | number;
  method: "cash" | "bank_transfer" | "cheque";
  settled_at: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  lease_id: string;
  amount: string | number;
  method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
};

export type ExpenseRow = {
  id: string;
  amount: string | number;
  category: string;
  description: string | null;
  expense_date: string;
  vendor: string | null;
  property_id: string | null;
  owner_id: string | null;
  properties?: { name: string } | { name: string }[] | null;
};

export type LeaseInfo = {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
};

export type OwnerDetailProps = {
  owner: Owner;
  properties: PropertyRow[];
  units: UnitRow[];
  businessFees: BusinessFeeRow[];
  settlements: SettlementRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  leaseInfo: Record<string, LeaseInfo>;
  balance: OwnerBalanceResult | null;
  activityWindowDays: number;
};
