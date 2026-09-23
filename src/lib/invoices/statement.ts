// Builds the month-by-month rows for a tenant's Statement of Account.
// Pure function so the route stays thin and the math is easy to follow.

export type StatementInvoiceStatus =
  | "pending"
  | "overdue"
  | "partial"
  | "paid"
  | "written_off";

export interface StatementInvoice {
  id: string;
  amount: number | string;
  paid_amount: number | string | null;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  status: StatementInvoiceStatus;
}

export interface StatementRow {
  id: string;
  monthKey: string; // YYYY-MM of the rent period
  dueDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  paid: number;
  balance: number; // what is still owed on this invoice
  runningBalance: number;
  status: "paid" | "partial" | "overdue" | "pending" | "written_off";
}

export interface Statement {
  rows: StatementRow[];
  openingBalance: number; // owed from invoices before `from`
  totalBilled: number;
  totalPaid: number;
  closingBalance: number;
  paidCount: number;
  unpaidCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const toNumber = (v: number | string | null) => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** YYYY-MM the invoice belongs to (rent period, falling back to due date). */
export function invoiceMonthKey(inv: Pick<StatementInvoice, "period_start" | "due_date">) {
  return (inv.period_start || inv.due_date).slice(0, 7);
}

/** Accepts "YYYY-MM"; anything else is treated as no bound. */
export function parseMonthParam(value: string | null): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export function buildStatement(
  invoices: StatementInvoice[],
  { from, to, today }: { from: string | null; to: string | null; today: Date }
): Statement {
  const todayKey = today.toISOString().slice(0, 10);
  const sorted = [...invoices].sort((a, b) => {
    const byMonth = invoiceMonthKey(a).localeCompare(invoiceMonthKey(b));
    return byMonth !== 0 ? byMonth : a.due_date.localeCompare(b.due_date);
  });

  const outstanding = (inv: StatementInvoice) =>
    inv.status === "written_off"
      ? 0
      : Math.max(0, round2(toNumber(inv.amount) - toNumber(inv.paid_amount)));

  let openingBalance = 0;
  let running = 0;
  let totalBilled = 0;
  let totalPaid = 0;
  let paidCount = 0;
  let unpaidCount = 0;
  const rows: StatementRow[] = [];

  for (const inv of sorted) {
    const key = invoiceMonthKey(inv);
    if (to && key > to) continue;
    if (from && key < from) {
      openingBalance = round2(openingBalance + outstanding(inv));
      continue;
    }
    if (rows.length === 0) running = openingBalance;

    const amount = toNumber(inv.amount);
    const paid = toNumber(inv.paid_amount);
    const balance = outstanding(inv);
    running = round2(running + balance);
    // Written-off rent stays visible as a row but is no longer billed, so
    // billed − paid always equals the closing balance.
    if (inv.status !== "written_off") {
      totalBilled = round2(totalBilled + amount);
      totalPaid = round2(totalPaid + paid);
    }

    let status: StatementRow["status"];
    if (inv.status === "written_off") status = "written_off";
    else if (balance === 0) status = "paid";
    else if (paid > 0) status = "partial";
    else if (inv.status === "overdue" || inv.due_date < todayKey) status = "overdue";
    else status = "pending";

    if (status === "paid") paidCount++;
    else if (status !== "written_off") unpaidCount++;

    rows.push({
      id: inv.id,
      monthKey: key,
      dueDate: inv.due_date,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      amount,
      paid,
      balance,
      runningBalance: running,
      status,
    });
  }

  return {
    rows,
    openingBalance,
    totalBilled,
    totalPaid,
    closingBalance: rows.length > 0 ? running : openingBalance,
    paidCount,
    unpaidCount,
  };
}
