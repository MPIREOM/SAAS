import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import {
  Building2,
  Home,
  Users,
  CreditCard,
  AlertTriangle,
  Wrench,
  Calendar,
  FileCheck,
} from "lucide-react";
import { format, parseISO, differenceInDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import RevenueChart from "@/components/dashboard/RevenueChart";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const supabase = await createClient();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [
    { count: propertyCount },
    { count: unitCount },
    { count: occupiedCount },
    { count: tenantCount },
    { count: openMaintenanceCount },
    { data: allActiveInvoices },
    { data: recentPayments },
    { data: upcomingLeases },
    { data: dueChequesRaw },
    { data: chartInvoices },
  ] = await Promise.all([
    supabase.from("properties").select("*", { count: "exact", head: true }).eq("is_archived", false),
    supabase.from("units").select("*", { count: "exact", head: true }),
    supabase.from("units").select("*", { count: "exact", head: true }).eq("status", "occupied"),
    supabase.from("leases").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("maintenance_requests").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    // Invoices that are overdue or pending-past-due
    supabase
      .from("invoices")
      .select("id, amount, due_date, status, tenants(id, full_name), units(unit_number, properties(name))")
      .in("status", ["overdue", "pending"])
      .order("due_date", { ascending: true }),
    // Recent payments
    supabase
      .from("payments")
      .select("id, amount, payment_date, payment_method, tenants(full_name), units(unit_number)")
      .order("payment_date", { ascending: false })
      .limit(6),
    // Active leases expiring in next 60 days
    supabase
      .from("leases")
      .select("id, end_date, monthly_rent, tenants(full_name), units(unit_number, properties(name))")
      .eq("is_active", true)
      .gte("end_date", todayStr)
      .lte("end_date", format(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"))
      .order("end_date", { ascending: true })
      .limit(6),
    // Pending cheques due within 7 days
    supabase
      .from("cheques")
      .select("id, cheque_number, cheque_date, amount, bank_name, tenants(id, full_name)")
      .eq("status", "pending")
      .gte("cheque_date", todayStr)
      .lte("cheque_date", format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"))
      .order("cheque_date", { ascending: true })
      .limit(6),
    // All invoices from last 12 months for the chart
    supabase
      .from("invoices")
      .select("amount, status, period_start")
      .gte("period_start", format(startOfMonth(subMonths(new Date(), 11)), "yyyy-MM-dd"))
      .lte("period_start", format(endOfMonth(new Date()), "yyyy-MM-dd")),
  ]);

  // Filter to truly overdue: status=overdue OR (status=pending AND due_date < today)
  const overdueInvoices = (allActiveInvoices ?? []).filter(
    (inv) => inv.status === "overdue" || (inv.status === "pending" && inv.due_date < todayStr)
  );

  // Build 12-month chart data
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const monthDate = subMonths(new Date(), 11 - i);
    const monthKey = format(monthDate, "yyyy-MM");
    const monthLabel = format(monthDate, "MMM yy");
    const monthInvoices = (chartInvoices ?? []).filter((inv) =>
      inv.period_start?.startsWith(monthKey)
    );
    const paid = monthInvoices
      .filter((inv) => inv.status === "paid")
      .reduce((sum, inv) => sum + parseFloat(inv.amount ?? "0"), 0);
    const pending = monthInvoices
      .filter((inv) => inv.status === "pending" || inv.status === "overdue")
      .reduce((sum, inv) => sum + parseFloat(inv.amount ?? "0"), 0);
    return { month: monthLabel, paid: Math.round(paid * 100) / 100, pending: Math.round(pending * 100) / 100 };
  });

  const occupancyRate = unitCount ? Math.round(((occupiedCount || 0) / unitCount) * 100) : 0;

  const stats = [
    { label: t("totalProperties"), value: propertyCount || 0, icon: Building2, color: "text-accent" },
    { label: t("totalUnits"), value: unitCount || 0, icon: Home, color: "text-blue-400" },
    { label: t("occupancyRate"), value: `${occupancyRate}%`, icon: Users, color: "text-success" },
    { label: t("activeTenants"), value: tenantCount || 0, icon: Users, color: "text-purple-400" },
    { label: t("openMaintenance"), value: openMaintenanceCount || 0, icon: Wrench, color: "text-warning" },
    { label: "Overdue Invoices", value: overdueInvoices.length, icon: AlertTriangle, color: "text-destructive" },
  ];

  const formatDate = (d: string) => {
    try { return format(parseISO(d), "dd MMM yyyy"); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{t("title")}</h1>
        <p className="text-sm text-text-secondary mt-1">{t("subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-text-secondary uppercase tracking-wider leading-tight">
                  {card.label}
                </span>
                <Icon className={`h-4 w-4 shrink-0 ${card.color}`} />
              </div>
              <p className="text-2xl font-semibold text-text-primary font-mono ltr-nums">
                {card.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Revenue Chart */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h3 className="text-sm font-medium text-text-primary mb-5">
          Revenue Overview — Last 12 Months
        </h3>
        <RevenueChart data={chartData} />
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Payments */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">{t("recentPayments")}</h3>
            <Link href="../payments" className="text-xs text-accent hover:text-accent-hover transition-colors">
              View all
            </Link>
          </div>
          {recentPayments && recentPayments.length > 0 ? (
            <div className="space-y-2">
              {recentPayments.map((p: Record<string, unknown>) => {
                const tenant = p.tenants as Record<string, unknown> | null;
                const unit = p.units as Record<string, unknown> | null;
                return (
                  <div key={p.id as string} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-text-primary">{(tenant?.full_name as string) || "—"}</p>
                      <p className="text-xs text-text-secondary font-mono">{(unit?.unit_number as string) || "—"} · {formatDate(p.payment_date as string)}</p>
                    </div>
                    <span className="text-sm font-medium text-success font-mono ltr-nums">
                      {p.amount as number} OMR
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
              <CreditCard className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t("noRecentPayments")}</p>
            </div>
          )}
        </div>

        {/* Overdue Invoices */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">{t("overduePayments")}</h3>
            <Link href="../invoices" className="text-xs text-accent hover:text-accent-hover transition-colors">
              View all
            </Link>
          </div>
          {overdueInvoices.length > 0 ? (
            <div className="space-y-2">
              {overdueInvoices.slice(0, 6).map((inv: Record<string, unknown>) => {
                const tenant = inv.tenants as Record<string, unknown> | null;
                const unit = inv.units as Record<string, unknown> | null;
                const prop = unit?.properties as Record<string, unknown> | null;
                const daysLate = differenceInDays(new Date(), parseISO(inv.due_date as string));
                return (
                  <div key={inv.id as string} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-text-primary">{(tenant?.full_name as string) || "—"}</p>
                      <p className="text-xs text-text-secondary font-mono">
                        {(unit?.unit_number as string) || "—"}
                        {prop?.name ? ` · ${prop.name}` : ""}
                        {" · "}
                        <span className="text-destructive">{daysLate}d overdue</span>
                      </p>
                    </div>
                    <span className="text-sm font-medium text-destructive font-mono ltr-nums">
                      {parseFloat(inv.amount as string).toFixed(2)} OMR
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
              <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t("noOverduePayments")}</p>
            </div>
          )}
        </div>

        {/* Upcoming Lease Expirations */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">{t("upcomingLeaseExpirations")}</h3>
            <Link href="../tenants" className="text-xs text-accent hover:text-accent-hover transition-colors">
              View all
            </Link>
          </div>
          {upcomingLeases && upcomingLeases.length > 0 ? (
            <div className="space-y-2">
              {upcomingLeases.map((lease: Record<string, unknown>) => {
                const tenant = lease.tenants as Record<string, unknown> | null;
                const unit = lease.units as Record<string, unknown> | null;
                const prop = unit?.properties as Record<string, unknown> | null;
                const daysLeft = differenceInDays(parseISO(lease.end_date as string), new Date());
                return (
                  <div key={lease.id as string} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-text-primary">{(tenant?.full_name as string) || "—"}</p>
                      <p className="text-xs text-text-secondary font-mono">
                        {(unit?.unit_number as string) || "—"}
                        {prop?.name ? ` · ${prop.name}` : ""}
                        {" · "}
                        {formatDate(lease.end_date as string)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                      daysLeft <= 14
                        ? "bg-destructive/10 text-destructive"
                        : daysLeft <= 30
                        ? "bg-warning/10 text-warning"
                        : "bg-text-secondary/10 text-text-secondary"
                    }`}>
                      {daysLeft}d left
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
              <Calendar className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t("noUpcomingExpirations")}</p>
            </div>
          )}
        </div>

        {/* Cheques Due This Week */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">{t("chequesDueThisWeek")}</h3>
            <Link href="../cheques" className="text-xs text-accent hover:text-accent-hover transition-colors">
              View all
            </Link>
          </div>
          {dueChequesRaw && dueChequesRaw.length > 0 ? (
            <div className="space-y-2">
              {dueChequesRaw.map((c: Record<string, unknown>) => {
                const tenant = c.tenants as Record<string, unknown> | null;
                return (
                  <div key={c.id as string} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-text-primary">{(tenant?.full_name as string) || "—"}</p>
                      <p className="text-xs text-text-secondary font-mono">
                        #{c.cheque_number as string} · {c.bank_name as string} · {formatDate(c.cheque_date as string)}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-warning font-mono ltr-nums">
                      {c.amount as number} OMR
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
              <FileCheck className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t("noChequesDue")}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
