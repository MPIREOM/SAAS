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
} from "lucide-react";
import { RentChart } from "@/components/dashboard/rent-chart";
import { format } from "date-fns";

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

  const [
    { count: propertyCount },
    { count: unitCount },
    { count: occupiedCount },
    { count: tenantCount },
    { count: openMaintenanceCount },
  ] = await Promise.all([
    supabase.from("properties").select("*", { count: "exact", head: true }).eq("is_archived", false),
    supabase.from("units").select("*", { count: "exact", head: true }),
    supabase.from("units").select("*", { count: "exact", head: true }).eq("status", "occupied"),
    supabase.from("tenants").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("maintenance_requests").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
  ]);

  const occupancyRate = unitCount ? Math.round(((occupiedCount || 0) / unitCount) * 100) : 0;

  return {
    propertyCount: propertyCount || 0,
    unitCount: unitCount || 0,
    occupiedCount: occupiedCount || 0,
    tenantCount: tenantCount || 0,
    openMaintenanceCount: openMaintenanceCount || 0,
    occupancyRate,
  };
}

async function getOverdueInvoices(): Promise<OverdueInvoice[]> {
  const supabase = await createClient();
  const today = format(new Date(), "yyyy-MM-dd");

  // Get invoices that are overdue (status = overdue OR pending + past due)
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
  const [stats, overdueInvoices] = await Promise.all([
    getDashboardStats(),
    getOverdueInvoices(),
  ]);

  const cards = [
    {
      label: t("totalProperties"),
      value: stats.propertyCount,
      icon: Building2,
      color: "text-accent",
      href: `/${locale}/properties`,
    },
    {
      label: t("totalUnits"),
      value: stats.unitCount,
      icon: Home,
      color: "text-blue-400",
      href: `/${locale}/properties`,
    },
    {
      label: t("occupancyRate"),
      value: `${stats.occupancyRate}%`,
      icon: Users,
      color: "text-success",
      href: `/${locale}/properties`,
    },
    {
      label: t("activeTenants"),
      value: stats.tenantCount,
      icon: Users,
      color: "text-purple-400",
      href: `/${locale}/tenants`,
    },
    {
      label: t("openMaintenance"),
      value: stats.openMaintenanceCount,
      icon: Wrench,
      color: "text-warning",
      href: `/${locale}/maintenance`,
    },
    {
      label: t("overdueInvoices"),
      value: overdueInvoices.length,
      icon: AlertTriangle,
      color: overdueInvoices.length > 0 ? "text-destructive" : "text-text-secondary",
      href: `/${locale}/invoices?status=pending`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t("subtitle")}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="bg-surface border border-border rounded-lg p-4 hover:border-accent/40 hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  {card.label}
                </span>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <p className="text-2xl font-semibold text-text-primary font-mono ltr-nums">
                {card.value}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Rent Collection Chart */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h3 className="text-sm font-medium text-text-primary mb-4">
          {t("rentCollection")}
        </h3>
        <RentChart />
      </div>

      {/* Placeholder sections for detailed dashboard content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-text-primary mb-4">
            {t("recentInvoices")}
          </h3>
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <FileText className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">{t("noRecentInvoices")}</p>
          </div>
        </div>

        {/* Overdue Payments */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            {t("overdueInvoices")}
            {overdueInvoices.length > 0 && (
              <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-mono">
                {overdueInvoices.length}
              </span>
            )}
          </h3>
          {overdueInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
              <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t("noOverdueInvoices")}</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {overdueInvoices.map((item) => (
                <div
                  key={item.invoiceId}
                  className="flex items-center justify-between p-3 rounded-md bg-destructive/5 border border-destructive/10"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {item.tenantName}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {item.propertyName} &middot; {t("unit")} {item.unitNumber}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-semibold font-mono text-destructive">
                      {item.amount} OMR
                    </p>
                    <p className="text-xs text-destructive/70">
                      {t("daysOverdue", { days: item.daysOverdue })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Lease Expirations */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-text-primary mb-4">
            {t("upcomingLeaseExpirations")}
          </h3>
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <Calendar className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">{t("noUpcomingExpirations")}</p>
          </div>
        </div>

      </div>
    </div>
  );
}
