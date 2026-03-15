import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import {
  Building2,
  Home,
  Users,
  FileText,
  AlertTriangle,
  Wrench,
  Calendar,
  TrendingUp,
  UserPlus,
  Bell,
  Receipt,
} from "lucide-react";
import { RentChart } from "@/components/dashboard/rent-chart";
import { CURRENCY } from "@/lib/currency";
import { format } from "date-fns";
import { getUserAccessiblePropertyIds, filterByProperties } from "@/lib/access-control";

interface OverdueInvoice {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  amount: string;
  daysOverdue: number;
  invoiceId: string;
}

async function getDashboardStats() {
  const supabase = await createClient();
  const propertyIds = await getUserAccessiblePropertyIds(supabase);

  const now = new Date();
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");

  // Properties query - filter by accessible IDs
  let propertiesQuery = supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("is_archived", false);
  propertiesQuery = filterByProperties(propertiesQuery, propertyIds, "id");

  // Units query - filter by property_id
  let unitsQuery = supabase
    .from("units")
    .select("*", { count: "exact", head: true });
  unitsQuery = filterByProperties(unitsQuery, propertyIds);

  // Occupied units query - filter by property_id
  let occupiedQuery = supabase
    .from("units")
    .select("*", { count: "exact", head: true })
    .eq("status", "occupied");
  occupiedQuery = filterByProperties(occupiedQuery, propertyIds);

  // Expenses this month - filter by property_id
  let expensesQuery = supabase
    .from("expenses")
    .select("amount")
    .gte("expense_date", monthStart)
    .lte("expense_date", monthEnd);
  expensesQuery = filterByProperties(expensesQuery, propertyIds);

  // Units for filtering invoices by property
  let unitsForInvoicesQuery = supabase
    .from("units")
    .select("id");
  unitsForInvoicesQuery = filterByProperties(unitsForInvoicesQuery, propertyIds);

  const [
    { count: propertyCount },
    { count: unitCount },
    { count: occupiedCount },
    { count: tenantCount },
    { count: openMaintenanceCount },
    { data: expensesData },
    { data: accessibleUnits },
  ] = await Promise.all([
    propertiesQuery,
    unitsQuery,
    occupiedQuery,
    supabase.from("tenants").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("maintenance_requests").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    expensesQuery,
    unitsForInvoicesQuery,
  ]);

  // Revenue this month (paid invoices) - filter by accessible unit IDs
  const unitIds = (accessibleUnits || []).map((u) => u.id);
  let revenueThisMonth = 0;
  if (unitIds.length > 0) {
    const { data: paidInvoices } = await supabase
      .from("invoices")
      .select("amount")
      .eq("status", "paid")
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .in("unit_id", unitIds);
    revenueThisMonth = (paidInvoices || []).reduce(
      (sum, inv) => sum + parseFloat(inv.amount as string), 0
    );
  }

  const expensesThisMonth = (expensesData || []).reduce(
    (sum, exp) => sum + parseFloat(exp.amount as string), 0
  );
  const netIncome = Math.round((revenueThisMonth - expensesThisMonth) * 100) / 100;

  const occupancyRate = unitCount ? Math.round(((occupiedCount || 0) / unitCount) * 100) : 0;

  return {
    propertyCount: propertyCount || 0,
    unitCount: unitCount || 0,
    occupiedCount: occupiedCount || 0,
    tenantCount: tenantCount || 0,
    openMaintenanceCount: openMaintenanceCount || 0,
    occupancyRate,
    expensesThisMonth: Math.round(expensesThisMonth * 100) / 100,
    netIncome,
    propertyIds,
  };
}

interface RecentInvoice {
  id: string;
  tenantName: string;
  amount: string;
  status: string;
  dueDate: string;
}

interface ExpiringLease {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  endDate: string;
  daysLeft: number;
}

async function getRecentInvoices(): Promise<RecentInvoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, amount, status, due_date, tenants!inner(full_name)")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data) return [];
  return data.map((inv) => ({
    id: inv.id,
    tenantName: (inv.tenants as unknown as { full_name: string }).full_name,
    amount: inv.amount,
    status: inv.status,
    dueDate: inv.due_date,
  }));
}

async function getExpiringLeases(): Promise<ExpiringLease[]> {
  const supabase = await createClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const ninetyDaysOut = format(
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd"
  );

  const { data } = await supabase
    .from("leases")
    .select("end_date, tenants!inner(full_name), units!inner(unit_number, properties!inner(name))")
    .eq("is_active", true)
    .gte("end_date", today)
    .lte("end_date", ninetyDaysOut)
    .order("end_date", { ascending: true })
    .limit(8);

  if (!data) return [];
  const now = new Date();
  return data.map((l) => {
    const tenant = l.tenants as unknown as { full_name: string };
    const unit = l.units as unknown as { unit_number: string; properties: { name: string } };
    const endDate = new Date(l.end_date);
    return {
      tenantName: tenant.full_name,
      unitNumber: unit.unit_number,
      propertyName: unit.properties.name,
      endDate: l.end_date,
      daysLeft: Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    };
  });
}

async function getOverdueInvoices(): Promise<OverdueInvoice[]> {
  const supabase = await createClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id,
      amount,
      due_date,
      status,
      tenants!inner(full_name),
      units!inner(unit_number, properties!inner(name))
    `)
    .in("status", ["pending", "overdue"])
    .lt("due_date", today)
    .order("due_date", { ascending: true });

  if (!invoices || invoices.length === 0) return [];

  const todayDate = new Date();
  return invoices.map((inv) => {
    const tenant = inv.tenants as unknown as { full_name: string };
    const unit = inv.units as unknown as {
      unit_number: string;
      properties: { name: string };
    };
    const dueDate = new Date(inv.due_date);
    const daysOverdue = Math.floor(
      (todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      tenantName: tenant.full_name,
      unitNumber: unit.unit_number,
      propertyName: unit.properties.name,
      amount: inv.amount,
      daysOverdue,
      invoiceId: inv.id,
    };
  }).sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("dashboard");
  const [stats, overdueInvoices, recentInvoices, expiringLeases] = await Promise.all([
    getDashboardStats(),
    getOverdueInvoices(),
    getRecentInvoices(),
    getExpiringLeases(),
  ]);

  const quickActions = [
    { label: t("addTenant"), href: `/${locale}/tenants/new`, icon: UserPlus },
    { label: t("addProperty"), href: `/${locale}/properties/new`, icon: Building2 },
    { label: t("newMaintenance"), href: `/${locale}/maintenance/new`, icon: Wrench },
    { label: t("sendReminders"), href: `/${locale}/reminders`, icon: Bell },
  ];

  const cards = [
    {
      label: t("totalProperties"),
      value: stats.propertyCount,
      icon: Building2,
      gradient: "from-accent/20 to-accent/5",
      iconColor: "text-accent",
      href: `/${locale}/properties`,
    },
    {
      label: t("totalUnits"),
      value: stats.unitCount,
      icon: Home,
      gradient: "from-blue-500/20 to-blue-500/5",
      iconColor: "text-blue-400",
      href: `/${locale}/properties`,
    },
    {
      label: t("occupancyRate"),
      value: `${stats.occupancyRate}%`,
      icon: TrendingUp,
      gradient: "from-success/20 to-success/5",
      iconColor: "text-success",
      href: `/${locale}/properties`,
    },
    {
      label: t("activeTenants"),
      value: stats.tenantCount,
      icon: Users,
      gradient: "from-purple-500/20 to-purple-500/5",
      iconColor: "text-purple-400",
      href: `/${locale}/tenants`,
    },
    {
      label: t("openMaintenance"),
      value: stats.openMaintenanceCount,
      icon: Wrench,
      gradient: "from-warning/20 to-warning/5",
      iconColor: "text-warning",
      href: `/${locale}/maintenance`,
    },
    {
      label: t("overdueInvoices"),
      value: overdueInvoices.length,
      icon: AlertTriangle,
      gradient: overdueInvoices.length > 0
        ? "from-destructive/20 to-destructive/5"
        : "from-surface-elevated to-surface",
      iconColor: overdueInvoices.length > 0 ? "text-destructive" : "text-text-secondary",
      href: `/${locale}/invoices?status=pending`,
    },
    {
      label: t("expensesThisMonth"),
      value: `${stats.expensesThisMonth.toLocaleString()} ${CURRENCY.code}`,
      icon: Receipt,
      gradient: "from-destructive/20 to-destructive/5",
      iconColor: "text-destructive",
      href: `/${locale}/expenses`,
    },
    {
      label: t("netIncome"),
      value: `${stats.netIncome.toLocaleString()} ${CURRENCY.code}`,
      icon: TrendingUp,
      gradient: stats.netIncome >= 0
        ? "from-success/20 to-success/5"
        : "from-destructive/20 to-destructive/5",
      iconColor: stats.netIncome >= 0 ? "text-success" : "text-destructive",
      href: `/${locale}/reports`,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-display font-bold text-text-primary tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t("subtitle")}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex items-center gap-2 h-9 px-4 bg-surface border border-border/50 rounded-lg text-sm text-text-secondary hover:text-accent hover:border-accent/30 transition-all duration-200"
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </Link>
          );
        })}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger-children">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="group relative bg-surface border border-border/40 rounded-xl p-5 hover:border-accent/30 transition-all duration-300 overflow-hidden"
            >
              {/* Gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] text-text-secondary uppercase tracking-widest font-semibold">
                    {card.label}
                  </span>
                  <div className={`h-8 w-8 rounded-lg bg-surface-elevated flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                </div>
                <p className="text-3xl font-display font-bold text-text-primary ltr-nums">
                  {card.value}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Rent Collection Chart */}
      <div className="bg-surface border border-border/40 rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
            {t("rentCollection")}
          </h3>
          <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        </div>
        <RentChart propertyIds={stats.propertyIds} />
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children">
        {/* Recent Invoices */}
        <div className="bg-surface border border-border/40 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
              {t("recentInvoices")}
            </h3>
            <Link
              href={`/${locale}/invoices`}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              {t("viewAll")}
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-secondary">
              <div className="h-12 w-12 rounded-xl bg-surface-elevated flex items-center justify-center mb-3">
                <FileText className="h-5 w-5 opacity-40" />
              </div>
              <p className="text-sm">{t("noRecentInvoices")}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/${locale}/invoices`}
                  className="flex items-center justify-between p-3.5 rounded-lg bg-surface-elevated/50 border border-border/30 hover:border-accent/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {inv.tenantName}
                    </p>
                    <p className="text-xs text-text-secondary mt-0.5 font-mono ltr-nums">
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3 flex items-center gap-2.5">
                    <span className="text-sm font-bold font-mono text-text-primary ltr-nums">
                      {inv.amount} {CURRENCY.code}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                        inv.status === "paid"
                          ? "bg-success/10 text-success"
                          : inv.status === "overdue"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-warning/10 text-warning"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Payments */}
        <div className="bg-surface border border-border/40 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
              {t("overdueInvoices")}
            </h3>
            {overdueInvoices.length > 0 && (
              <span className="text-xs bg-destructive/12 text-destructive px-2.5 py-1 rounded-md font-mono font-semibold border border-destructive/20">
                {overdueInvoices.length}
              </span>
            )}
          </div>
          {overdueInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-secondary">
              <div className="h-12 w-12 rounded-xl bg-surface-elevated flex items-center justify-center mb-3">
                <AlertTriangle className="h-5 w-5 opacity-40" />
              </div>
              <p className="text-sm">{t("noOverdueInvoices")}</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {overdueInvoices.map((item) => (
                <div
                  key={item.invoiceId}
                  className="flex items-center justify-between p-3.5 rounded-lg bg-destructive/5 border border-destructive/10 hover:border-destructive/20 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {item.tenantName}
                    </p>
                    <p className="text-xs text-text-secondary truncate mt-0.5">
                      {item.propertyName} &middot; {t("unit")} {item.unitNumber}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold font-mono text-destructive">
                      {item.amount} {CURRENCY.code}
                    </p>
                    <p className="text-xs text-destructive/60 mt-0.5">
                      {t("daysOverdue", { days: item.daysOverdue })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Lease Expirations */}
        <div className="bg-surface border border-border/40 rounded-xl p-6">
          <h3 className="text-base font-display font-semibold text-text-primary mb-5 tracking-tight">
            {t("upcomingLeaseExpirations")}
          </h3>
          {expiringLeases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-secondary">
              <div className="h-12 w-12 rounded-xl bg-surface-elevated flex items-center justify-center mb-3">
                <Calendar className="h-5 w-5 opacity-40" />
              </div>
              <p className="text-sm">{t("noUpcomingExpirations")}</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {expiringLeases.map((lease, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3.5 rounded-lg border transition-colors ${
                    lease.daysLeft <= 30
                      ? "bg-warning/5 border-warning/15 hover:border-warning/30"
                      : "bg-surface-elevated/50 border-border/30 hover:border-accent/30"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {lease.tenantName}
                    </p>
                    <p className="text-xs text-text-secondary truncate mt-0.5">
                      {lease.propertyName} &middot; {t("unit")} {lease.unitNumber}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-mono text-text-primary ltr-nums">
                      {new Date(lease.endDate).toLocaleDateString()}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${
                        lease.daysLeft <= 30 ? "text-warning font-medium" : "text-text-secondary"
                      }`}
                    >
                      {lease.daysLeft} {t("daysLeft")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
