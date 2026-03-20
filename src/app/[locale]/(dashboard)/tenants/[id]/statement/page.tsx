import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { format } from "date-fns";
import { CURRENCY } from "@/lib/currency";

interface LedgerEntry {
  date: string;
  description: string;
  charge: number;
  payment: number;
  balance: number;
  type: "charge" | "payment";
}

export default async function TenantStatementPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: tenantId } = await params;
  const t = await getTranslations("tenants");
  const supabase = await createClient();

  // Fetch tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("full_name, phone, email")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Tenant not found</p>
      </div>
    );
  }

  // Fetch all invoices for this tenant
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, amount, due_date, status, period_start, period_end, units!inner(unit_number, properties!inner(name))")
    .eq("tenant_id", tenantId)
    .order("due_date", { ascending: true });

  // Fetch all payments for this tenant
  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, payment_date, method, reference_number")
    .eq("tenant_id", tenantId)
    .order("payment_date", { ascending: true });

  // Build ledger entries
  const entries: LedgerEntry[] = [];

  (invoices || []).forEach((inv) => {
    const unit = inv.units as unknown as { unit_number: string; properties: { name: string } };
    entries.push({
      date: inv.due_date,
      description: `Rent - ${unit.properties.name} Unit ${unit.unit_number}${inv.period_start ? ` (${inv.period_start} to ${inv.period_end})` : ""}`,
      charge: parseFloat(inv.amount as string),
      payment: 0,
      balance: 0,
      type: "charge",
    });
  });

  (payments || []).forEach((pay) => {
    entries.push({
      date: pay.payment_date,
      description: `Payment${pay.method ? ` (${pay.method})` : ""}${pay.reference_number ? ` - Ref: ${pay.reference_number}` : ""}`,
      charge: 0,
      payment: parseFloat(pay.amount as string),
      balance: 0,
      type: "payment",
    });
  });

  // Sort by date
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate running balance
  let runningBalance = 0;
  entries.forEach((entry) => {
    runningBalance += entry.charge - entry.payment;
    entry.balance = Math.round(runningBalance * 100) / 100;
  });

  const totalCharges = entries.reduce((sum, e) => sum + e.charge, 0);
  const totalPayments = entries.reduce((sum, e) => sum + e.payment, 0);
  const outstandingBalance = Math.round((totalCharges - totalPayments) * 100) / 100;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/tenants/${tenantId}`}
            className="p-2 rounded-lg hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-text-primary">Statement of Account</h1>
            <p className="text-sm text-text-secondary">{tenant.full_name}</p>
          </div>
        </div>
        <Link
          href="#"
          className="inline-flex items-center gap-2 h-9 px-4 bg-surface border border-border/50 rounded-lg text-sm text-text-secondary hover:text-accent hover:border-accent/30 transition-all print:hidden"
          title="Use Ctrl+P / Cmd+P to print"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-text-secondary uppercase tracking-widest font-semibold">Total Charges</p>
          <p className="text-2xl font-bold font-mono text-text-primary mt-1">{totalCharges.toLocaleString()} {CURRENCY.code}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-text-secondary uppercase tracking-widest font-semibold">Total Payments</p>
          <p className="text-2xl font-bold font-mono text-success mt-1">{totalPayments.toLocaleString()} {CURRENCY.code}</p>
        </div>
        <div className={`bg-surface border rounded-xl p-4 ${outstandingBalance > 0 ? "border-destructive/30" : "border-success/30"}`}>
          <p className="text-xs text-text-secondary uppercase tracking-widest font-semibold">Outstanding Balance</p>
          <p className={`text-2xl font-bold font-mono mt-1 ${outstandingBalance > 0 ? "text-destructive" : "text-success"}`}>
            {outstandingBalance.toLocaleString()} {CURRENCY.code}
          </p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <div className="h-14 w-14 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 opacity-40" />
            </div>
            <p className="text-sm">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/30">
                  <th className="text-start text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">Date</th>
                  <th className="text-start text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">Description</th>
                  <th className="text-end text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">Charge</th>
                  <th className="text-end text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">Payment</th>
                  <th className="text-end text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-surface-elevated/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-text-secondary">
                      {format(new Date(entry.date), "dd MMM yyyy")}
                    </td>
                    <td className="py-3 px-4 text-text-primary">{entry.description}</td>
                    <td className="py-3 px-4 text-end font-mono">
                      {entry.charge > 0 ? (
                        <span className="text-text-primary">{entry.charge.toLocaleString()} {CURRENCY.code}</span>
                      ) : "\u2014"}
                    </td>
                    <td className="py-3 px-4 text-end font-mono">
                      {entry.payment > 0 ? (
                        <span className="text-success">{entry.payment.toLocaleString()} {CURRENCY.code}</span>
                      ) : "\u2014"}
                    </td>
                    <td className={`py-3 px-4 text-end font-mono font-medium ${entry.balance > 0 ? "text-destructive" : "text-success"}`}>
                      {entry.balance.toLocaleString()} {CURRENCY.code}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-elevated/50">
                  <td className="py-3 px-4 font-semibold text-text-primary" colSpan={2}>Total</td>
                  <td className="py-3 px-4 text-end font-mono font-bold text-text-primary">
                    {totalCharges.toLocaleString()} {CURRENCY.code}
                  </td>
                  <td className="py-3 px-4 text-end font-mono font-bold text-success">
                    {totalPayments.toLocaleString()} {CURRENCY.code}
                  </td>
                  <td className={`py-3 px-4 text-end font-mono font-bold ${outstandingBalance > 0 ? "text-destructive" : "text-success"}`}>
                    {outstandingBalance.toLocaleString()} {CURRENCY.code}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
