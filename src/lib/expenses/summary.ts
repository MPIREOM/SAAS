import type { SupabaseClient } from "@supabase/supabase-js";

export type ExpensePeriodSummary = {
  total: number;
  count: number;
  byCategory: Record<string, number>;
};

export type ExpensesSummary = {
  previousDay: ExpensePeriodSummary & { date: string };
  monthToDate: ExpensePeriodSummary & { from: string; to: string };
  yearToDate: ExpensePeriodSummary & { from: string; to: string };
};

// Total expenses for the previous day, month-to-date (MTD) and year-to-date
// (YTD), each with a per-category breakdown. Dates are evaluated in Muscat
// local time (UTC+4) so the period boundaries match the Oman business calendar
// used by the owner reports and the daily admin brief.
//
// Business manager fees (owner_business_fees) and commission are stored in
// their own tables / computed on the fly — they are NOT rows in the expenses
// table, so querying expenses alone naturally excludes them from these
// figures. Shared by the WhatsApp agent (get_expenses_summary tool) and the
// daily admin-summary cron so both report identical numbers.
export async function getExpensesSummary(
  supabase: SupabaseClient,
  options: { propertyId?: string; now?: Date } = {},
): Promise<ExpensesSummary> {
  const base = options.now ?? new Date();
  const muscatNow = new Date(base.getTime() + 4 * 60 * 60 * 1000);
  const ymd = (d: Date) => d.toISOString().split("T")[0];
  const today = ymd(muscatNow);
  const yesterday = ymd(new Date(muscatNow.getTime() - 24 * 60 * 60 * 1000));
  const year = muscatNow.getUTCFullYear();
  const month = String(muscatNow.getUTCMonth() + 1).padStart(2, "0");
  const monthStart = `${year}-${month}-01`;
  const yearStart = `${year}-01-01`;

  // Pull from the earliest date we need (year start, or yesterday if it
  // precedes it — e.g. on Jan 1) up to today, then bucket in JS. One query
  // instead of three round-trips.
  const lowerBound = yesterday < yearStart ? yesterday : yearStart;
  let query = supabase
    .from("expenses")
    .select("amount, category, expense_date")
    .gte("expense_date", lowerBound)
    .lte("expense_date", today);
  if (options.propertyId) query = query.eq("property_id", options.propertyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const newPeriod = (): ExpensePeriodSummary => ({
    total: 0,
    count: 0,
    byCategory: {},
  });
  const previousDay = newPeriod();
  const mtd = newPeriod();
  const ytd = newPeriod();
  const addTo = (p: ExpensePeriodSummary, amount: number, category: string) => {
    p.total += amount;
    p.count += 1;
    p.byCategory[category] = (p.byCategory[category] || 0) + amount;
  };

  for (const row of (data || []) as Record<string, unknown>[]) {
    const amount = Number(row.amount || 0);
    const category = (row.category as string) || "other";
    const date = row.expense_date as string;
    if (date === yesterday) addTo(previousDay, amount, category);
    if (date >= monthStart && date <= today) addTo(mtd, amount, category);
    if (date >= yearStart && date <= today) addTo(ytd, amount, category);
  }

  return {
    previousDay: { date: yesterday, ...previousDay },
    monthToDate: { from: monthStart, to: today, ...mtd },
    yearToDate: { from: yearStart, to: today, ...ytd },
  };
}
