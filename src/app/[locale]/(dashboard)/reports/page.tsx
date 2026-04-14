import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Building2,
  Download,
  Users,
  Wrench,
  CreditCard,
} from "lucide-react";
import { getUserAccessiblePropertyIds, filterByProperties } from "@/lib/access-control";
import { CollectionChart, type MonthlyCollectionData } from "@/components/reports/collection-chart";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { PageHeader } from "@/components/ui/page-header";
import { CURRENCY } from "@/lib/currency";

/* ------------------------------------------------------------------ */
/*  Data-fetching helpers                                              */
/* ------------------------------------------------------------------ */

interface FinancialMetrics {
  revenueThisMonth: number;
  collectionRate: number;
  outstandingBalance: number;
  propertyCount: number;
  unitCount: number;
}

async function getFinancialMetrics(selectedMonth?: string, selectedYear?: string): Promise<FinancialMetrics> {
  const supabase = await createClient();
  const propertyIds = await getUserAccessiblePropertyIds(supabase);

  const now = new Date();
  const month = selectedMonth ? parseInt(selectedMonth) - 1 : now.getMonth();
  const year = selectedYear ? parseInt(selectedYear) : now.getFullYear();
  const monthStart = format(new Date(year, month, 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(year, month + 1, 0), "yyyy-MM-dd");

  // Properties count
  let propertiesQuery = supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("is_archived", false);
  propertiesQuery = filterByProperties(propertiesQuery, propertyIds, "id");

  // Units count
  let unitsQuery = supabase
    .from("units")
    .select("*", { count: "exact", head: true });
  unitsQuery = filterByProperties(unitsQuery, propertyIds);

  // Invoices this month (all statuses)
  let allInvoicesQuery = supabase
    .from("invoices")
    .select("amount, status")
    .gte("due_date", monthStart)
    .lte("due_date", monthEnd);

  // Outstanding invoices (pending + overdue, all time)
  let outstandingQuery = supabase
    .from("invoices")
    .select("amount")
    .in("status", ["pending", "overdue", "partial"]);

  const [
    { count: propertyCount },
    { count: unitCount },
    { data: monthInvoices },
    { data: outstandingInvoices },
  ] = await Promise.all([
    propertiesQuery,
    unitsQuery,
    allInvoicesQuery,
    outstandingQuery,
  ]);

  const totalThisMonth = (monthInvoices || []).reduce(
    (sum, inv) => sum + parseFloat(inv.amount as string),
    0
  );
  const paidThisMonth = (monthInvoices || [])
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + parseFloat(inv.amount as string), 0);

  const outstandingTotal = (outstandingInvoices || []).reduce(
    (sum, inv) => sum + parseFloat(inv.amount as string),
    0
  );

  const collectionRate = totalThisMonth > 0
    ? Math.round((paidThisMonth / totalThisMonth) * 100)
    : 0;

  return {
    revenueThisMonth: Math.round(paidThisMonth * 100) / 100,
    collectionRate,
    outstandingBalance: Math.round(outstandingTotal * 100) / 100,
    propertyCount: propertyCount || 0,
    unitCount: unitCount || 0,
  };
}

async function getMonthlyTrend(): Promise<MonthlyCollectionData[]> {
  const supabase = await createClient();
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const startDate = format(sixMonthsAgo, "yyyy-MM-dd");

  const { data: invoiceRows } = await supabase
    .from("invoices")
    .select("amount, due_date, status")
    .gte("due_date", startDate)
    .order("due_date", { ascending: true });

  const months: MonthlyCollectionData[] = [];
  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const monthLabel = date.toLocaleDateString("en", {
      month: "short",
      year: "2-digit",
    });

    const monthInvoices = (invoiceRows || []).filter((inv) => {
      const d = new Date(inv.due_date as string);
      return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth();
    });

    const invoiced = monthInvoices.reduce(
      (sum, inv) => sum + parseFloat(inv.amount as string),
      0
    );
    const collected = monthInvoices
      .filter((inv) => inv.status === "paid")
      .reduce((sum, inv) => sum + parseFloat(inv.amount as string), 0);

    months.push({
      month: monthLabel,
      invoiced: Math.round(invoiced * 100) / 100,
      collected: Math.round(collected * 100) / 100,
    });
  }

  return months;
}

interface PropertyPerformance {
  id: string;
  name: string;
  totalUnits: number;
  occupiedUnits: number;
  occupancyPct: number;
  monthlyRevenue: number;
  collectedThisMonth: number;
  expensesThisMonth: number;
  net: number;
}

async function getPropertyPerformance(selectedMonth?: string, selectedYear?: string): Promise<PropertyPerformance[]> {
  const supabase = await createClient();
  const propertyIds = await getUserAccessiblePropertyIds(supabase);

  const now = new Date();
  const month = selectedMonth ? parseInt(selectedMonth) - 1 : now.getMonth();
  const year = selectedYear ? parseInt(selectedYear) : now.getFullYear();
  const monthStart = format(new Date(year, month, 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(year, month + 1, 0), "yyyy-MM-dd");

  // Fetch properties
  let propsQuery = supabase
    .from("properties")
    .select("id, name")
    .eq("is_archived", false);
  propsQuery = filterByProperties(propsQuery, propertyIds, "id");
  const { data: properties } = await propsQuery;
  if (!properties || properties.length === 0) return [];

  // Fetch all units with property_id
  let unitsQ = supabase.from("units").select("id, property_id, status, rent_amount");
  unitsQ = filterByProperties(unitsQ, propertyIds);
  const { data: units } = await unitsQ;

  // Fetch invoices this month that have units -> property linkage
  const { data: monthInvoices } = await supabase
    .from("invoices")
    .select("amount, status, unit_id")
    .gte("due_date", monthStart)
    .lte("due_date", monthEnd);

  // Fetch expenses this month grouped by property
  let expensesQ = supabase
    .from("expenses")
    .select("property_id, amount")
    .gte("expense_date", monthStart)
    .lte("expense_date", monthEnd);
  expensesQ = filterByProperties(expensesQ, propertyIds);
  const { data: expenseData } = await expensesQ;

  const unitMap = new Map<string, { property_id: string }>();
  (units || []).forEach((u) => {
    unitMap.set(u.id, { property_id: u.property_id });
  });

  const result: PropertyPerformance[] = properties.map((prop) => {
    const propUnits = (units || []).filter((u) => u.property_id === prop.id);
    const totalUnits = propUnits.length;
    const occupiedUnits = propUnits.filter((u) => u.status === "occupied").length;
    const monthlyRevenue = propUnits.reduce(
      (sum, u) => sum + parseFloat((u.rent_amount as string) || "0"),
      0
    );

    // Invoices for this property this month
    const propInvoices = (monthInvoices || []).filter((inv) => {
      const unitInfo = unitMap.get(inv.unit_id);
      return unitInfo && unitInfo.property_id === prop.id;
    });
    const collectedThisMonth = propInvoices
      .filter((inv) => inv.status === "paid")
      .reduce((sum, inv) => sum + parseFloat(inv.amount as string), 0);

    // Expenses for this property this month
    const propExpenses = (expenseData || [])
      .filter((exp) => exp.property_id === prop.id)
      .reduce((sum, exp) => sum + parseFloat(exp.amount as string), 0);

    const expensesRounded = Math.round(propExpenses * 100) / 100;
    const collectedRounded = Math.round(collectedThisMonth * 100) / 100;

    return {
      id: prop.id,
      name: prop.name,
      totalUnits,
      occupiedUnits,
      occupancyPct: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      collectedThisMonth: collectedRounded,
      expensesThisMonth: expensesRounded,
      net: Math.round((collectedRounded - expensesRounded) * 100) / 100,
    };
  });

  // Sort by revenue descending
  result.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

const exportReports = [
  {
    id: "monthly-rent",
    titleKey: "monthlyRentCollection" as const,
    icon: DollarSign,
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    id: "tenant-roster",
    titleKey: "tenantRoster" as const,
    icon: Users,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    id: "maintenance-summary",
    titleKey: "maintenanceSummary" as const,
    icon: Wrench,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    id: "cheque-tracker",
    titleKey: "chequeTracker" as const,
    icon: CreditCard,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    id: "document-expiry",
    titleKey: "documentExpiry" as const,
    icon: AlertTriangle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
];

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const { locale } = await params;
  const { month, year } = await searchParams;
  const t = await getTranslations("reports");

  const [metrics, monthlyTrend, propertyPerformance] = await Promise.all([
    getFinancialMetrics(month, year),
    getMonthlyTrend(),
    getPropertyPerformance(month, year),
  ]);

  const metricCards = [
    {
      label: t("revenueThisMonth"),
      value: `${metrics.revenueThisMonth.toLocaleString()} ${CURRENCY.code}`,
      icon: DollarSign,
      gradient: "from-success/20 to-success/5",
      iconColor: "text-success",
    },
    {
      label: t("collectionRateLabel"),
      value: `${metrics.collectionRate}%`,
      icon: TrendingUp,
      gradient: metrics.collectionRate >= 80
        ? "from-success/20 to-success/5"
        : metrics.collectionRate >= 50
        ? "from-warning/20 to-warning/5"
        : "from-destructive/20 to-destructive/5",
      iconColor: metrics.collectionRate >= 80
        ? "text-success"
        : metrics.collectionRate >= 50
        ? "text-warning"
        : "text-destructive",
    },
    {
      label: t("outstandingBalance"),
      value: `${metrics.outstandingBalance.toLocaleString()} ${CURRENCY.code}`,
      icon: AlertTriangle,
      gradient: metrics.outstandingBalance > 0
        ? "from-destructive/20 to-destructive/5"
        : "from-surface-elevated to-surface",
      iconColor: metrics.outstandingBalance > 0 ? "text-destructive" : "text-text-secondary",
    },
    {
      label: t("propertiesAndUnits"),
      value: `${metrics.propertyCount} / ${metrics.unitCount}`,
      icon: Building2,
      gradient: "from-accent/20 to-accent/5",
      iconColor: "text-accent",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <DateRangeFilter defaultMonth={month} defaultYear={year} />
      </PageHeader>

      {/* Key Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="group relative bg-surface border border-border rounded-xl p-5 overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-60`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] text-text-secondary uppercase tracking-widest font-semibold">
                    {card.label}
                  </span>
                  <div className="h-8 w-8 rounded-lg bg-surface-elevated flex items-center justify-center">
                    <Icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                </div>
                <p className="text-3xl font-display font-bold text-text-primary font-mono ltr-nums">
                  {card.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly Collection Trend */}
      <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
            {t("collectionTrend")}
          </h3>
          <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        </div>
        <CollectionChart data={monthlyTrend} />
      </div>

      {/* Property Performance Table */}
      <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
        <h3 className="text-base font-display font-semibold text-text-primary tracking-tight mb-5">
          {t("propertyPerformance")}
        </h3>
        {propertyPerformance.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-text-secondary">
            <div className="h-12 w-12 rounded-xl bg-surface-elevated flex items-center justify-center mb-3">
              <Building2 className="h-5 w-5 opacity-40" />
            </div>
            <p className="text-sm">{t("noReportData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 pe-4">
                    {t("propertyName")}
                  </th>
                  <th className="text-center text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">
                    {t("units")}
                  </th>
                  <th className="text-center text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">
                    {t("occupancy")}
                  </th>
                  <th className="text-end text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">
                    {t("monthlyRevenueLabel")}
                  </th>
                  <th className="text-end text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">
                    {t("collectedLabel")}
                  </th>
                  <th className="text-end text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">
                    {t("expenses")}
                  </th>
                  <th className="text-end text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 ps-4">
                    {t("net")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {propertyPerformance.map((prop) => (
                  <tr
                    key={prop.id}
                    className="border-b border-border/20 hover:bg-surface-elevated/30 transition-colors"
                  >
                    <td className="py-3.5 pe-4">
                      <Link
                        href={`/${locale}/properties/${prop.id}`}
                        className="font-medium text-text-primary hover:text-accent transition-colors"
                      >
                        {prop.name}
                      </Link>
                    </td>
                    <td className="text-center py-3.5 px-4 font-mono ltr-nums text-text-secondary">
                      {prop.totalUnits}
                    </td>
                    <td className="text-center py-3.5 px-4">
                      <span
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full font-mono ltr-nums ${
                          prop.occupancyPct >= 80
                            ? "bg-success/10 text-success"
                            : prop.occupancyPct >= 50
                            ? "bg-warning/10 text-warning"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {prop.occupancyPct}%
                      </span>
                    </td>
                    <td className="text-end py-3.5 px-4 font-mono ltr-nums text-text-primary font-medium">
                      {prop.monthlyRevenue.toLocaleString()} {CURRENCY.code}
                    </td>
                    <td className="text-end py-3.5 px-4 font-mono ltr-nums text-accent font-medium">
                      {prop.collectedThisMonth.toLocaleString()} {CURRENCY.code}
                    </td>
                    <td className="text-end py-3.5 px-4 font-mono ltr-nums text-destructive font-medium">
                      {prop.expensesThisMonth.toLocaleString()} {CURRENCY.code}
                    </td>
                    <td className={`text-end py-3.5 ps-4 font-mono ltr-nums font-medium ${
                      prop.net >= 0 ? "text-success" : "text-destructive"
                    }`}>
                      {prop.net.toLocaleString()} {CURRENCY.code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Reports */}
      <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "400ms" }}>
        <h3 className="text-base font-display font-semibold text-text-primary tracking-tight mb-5">
          {t("exportReports")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {exportReports.map((report) => {
            const Icon = report.icon;
            return (
              <div
                key={report.id}
                className="bg-surface-elevated/50 border border-border/30 rounded-lg p-4 flex flex-col"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`p-1.5 rounded-md ${report.bgColor}`}>
                    <Icon className={`h-3.5 w-3.5 ${report.color}`} />
                  </div>
                  <span className="text-xs font-medium text-text-primary font-display truncate">
                    {t(report.titleKey)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-auto">
                  <Link
                    href={`/api/reports/${report.id}?format=csv`}
                    target="_blank"
                    className="inline-flex items-center gap-1 h-7 px-2.5 bg-accent hover:bg-accent-hover text-background text-[11px] font-medium rounded-md transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    {t("exportExcel")}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
