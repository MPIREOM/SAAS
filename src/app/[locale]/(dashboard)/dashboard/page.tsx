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
import { RentChart } from "@/components/dashboard/rent-chart";

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

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const stats = await getDashboardStats();

  const cards = [
    {
      label: t("totalProperties"),
      value: stats.propertyCount,
      icon: Building2,
      color: "text-accent",
    },
    {
      label: t("totalUnits"),
      value: stats.unitCount,
      icon: Home,
      color: "text-blue-400",
    },
    {
      label: t("occupancyRate"),
      value: `${stats.occupancyRate}%`,
      icon: Users,
      color: "text-success",
    },
    {
      label: t("activeTenants"),
      value: stats.tenantCount,
      icon: Users,
      color: "text-purple-400",
    },
    {
      label: t("openMaintenance"),
      value: stats.openMaintenanceCount,
      icon: Wrench,
      color: "text-warning",
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-surface border border-border rounded-lg p-4 hover:border-border/80 transition-colors"
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
            </div>
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
        {/* Recent Payments */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-text-primary mb-4">
            {t("recentPayments")}
          </h3>
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <CreditCard className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">{t("noRecentPayments")}</p>
          </div>
        </div>

        {/* Overdue Payments */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-text-primary mb-4">
            {t("overduePayments")}
          </h3>
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">{t("noOverduePayments")}</p>
          </div>
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

        {/* Cheques Due */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-text-primary mb-4">
            {t("chequesDueThisWeek")}
          </h3>
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <FileCheck className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">{t("noChequesDue")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
