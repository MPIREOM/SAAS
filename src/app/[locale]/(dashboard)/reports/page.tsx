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
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
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
  const allInvoicesQuery = supabase
    .from("invoices")
    .select("amount, status")
    .gte("due_date", monthStart)
    .lte("due_date", monthEnd);

  // Outstanding invoices (pending + overdue, all time)
  const outstandingQuery = supabase
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

  // Fetch all units with property_id
  let unitsQ = supabase.from("units").select("id, property_id, status, rent_amount");
  unitsQ = filterByProperties(unitsQ, propertyIds);

  // Fetch expenses this month grouped by property
  let expensesQ = supabase
    .from("expenses")
    .select("property_id, amount")
    .gte("expense_date", monthStart)
    .lte("expense_date", monthEnd);
  expensesQ = filterByProperties(expensesQ, propertyIds);

  // None of these depend on each other — load all four in parallel
  const [
    { data: properties },
    { data: units },
    { data: monthInvoices },
    { data: expenseData },
  ] = await Promise.all([
    propsQuery,
    unitsQ,
    supabase
      .from("invoices")
      .select("amount, status, unit_id")
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd),
    expensesQ,
  ]);

  if (!properties || properties.length === 0) return [];

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
    descKey: "monthlyRentCollectionDesc" as const,
    icon: DollarSign,
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    id: "tenant-roster",
    titleKey: "tenantRoster" as const,
    descKey: "tenantRosterDesc" as const,
    icon: Users,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    id: "maintenance-summary",
    titleKey: "maintenanceSummary" as const,
    descKey: "maintenanceSummaryDesc" as const,
    icon: Wrench,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    id: "cheque-tracker",
    titleKey: "chequeTracker" as const,
    descKey: "chequeTrackerDesc" as const,
    icon: CreditCard,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    id: "document-expiry",
    titleKey: "documentExpiry" as const,
    descKey: "documentExpiryDesc" as const,
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

  const occupancyVariant = (pct: number): "success" | "warning" | "destructive" =>
    pct >= 80 ? "success" : pct >= 50 ? "warning" : "destructive";

  return (
    <div className="space-y-6 stagger-children">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-surface px-3 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t("dateRange")}
          </span>
          <DateRangeFilter defaultMonth={month} defaultYear={year} />
        </div>
      </PageHeader>

      {/* Key Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="group relative bg-surface border border-border/60 rounded-xl p-5 overflow-hidden"
            >
              <div
                aria-hidden="true"
                className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-60`}
              />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] text-text-secondary uppercase tracking-widest font-semibold">
                    {card.label}
                  </span>
                  <div className="h-8 w-8 rounded-lg bg-surface-elevated flex items-center justify-center">
                    <Icon aria-hidden="true" className={`h-4 w-4 ${card.iconColor}`} />
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
      <section className="bg-surface border border-border/60 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-display font-semibold text-text-primary tracking-tight">
            {t("collectionTrend")}
          </h2>
          <div aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        </div>
        <CollectionChart data={monthlyTrend} />
      </section>

      {/* Property Performance Table */}
      <section className="bg-surface border border-border/60 rounded-xl overflow-hidden">
        <h2 className="px-6 pt-6 pb-5 text-base font-display font-semibold text-text-primary tracking-tight">
          {t("propertyPerformance")}
        </h2>
        {propertyPerformance.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title={t("noReportData")}
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="ps-6 pe-4">{t("propertyName")}</TableHead>
                    <TableHead className="px-4 text-center">{t("units")}</TableHead>
                    <TableHead className="px-4 text-center">{t("occupancy")}</TableHead>
                    <TableHead className="px-4 text-end">{t("monthlyRevenueLabel")}</TableHead>
                    <TableHead className="px-4 text-end">{t("collectedLabel")}</TableHead>
                    <TableHead className="px-4 text-end">{t("expenses")}</TableHead>
                    <TableHead className="ps-4 pe-6 text-end">{t("net")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propertyPerformance.map((prop) => (
                    <TableRow key={prop.id}>
                      <TableCell className="ps-6 pe-4 py-3.5">
                        <Link
                          href={`/${locale}/properties/${prop.id}`}
                          className="font-medium text-text-primary hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                        >
                          {prop.name}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center font-mono ltr-nums text-text-secondary">
                        {prop.totalUnits}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center">
                        <Badge
                          variant={occupancyVariant(prop.occupancyPct)}
                          className="font-mono ltr-nums"
                        >
                          {prop.occupancyPct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-end font-mono ltr-nums text-text-primary font-medium whitespace-nowrap">
                        {prop.monthlyRevenue.toLocaleString()}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-end font-mono ltr-nums text-accent font-medium whitespace-nowrap">
                        {prop.collectedThisMonth.toLocaleString()}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-end font-mono ltr-nums text-destructive font-medium whitespace-nowrap">
                        {prop.expensesThisMonth.toLocaleString()}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`ps-4 pe-6 py-3.5 text-end font-mono ltr-nums font-semibold whitespace-nowrap ${
                          prop.net >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {prop.net.toLocaleString()}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-border/30 border-t border-border/40">
              {propertyPerformance.map((prop) => (
                <li key={`m-${prop.id}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/${locale}/properties/${prop.id}`}
                      className="min-w-0 truncate text-sm font-medium text-text-primary hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                    >
                      {prop.name}
                    </Link>
                    <Badge
                      variant={occupancyVariant(prop.occupancyPct)}
                      className="shrink-0 font-mono ltr-nums"
                    >
                      {prop.occupancyPct}%
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        {t("units")}
                      </dt>
                      <dd className="mt-0.5 font-mono ltr-nums text-text-primary">
                        {prop.totalUnits}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        {t("monthlyRevenueLabel")}
                      </dt>
                      <dd className="mt-0.5 font-mono ltr-nums text-text-primary">
                        {prop.monthlyRevenue.toLocaleString()}{" "}
                        <span className="text-[10px] text-text-secondary">{CURRENCY.code}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        {t("collectedLabel")}
                      </dt>
                      <dd className="mt-0.5 font-mono ltr-nums text-accent">
                        {prop.collectedThisMonth.toLocaleString()}{" "}
                        <span className="text-[10px] text-text-secondary">{CURRENCY.code}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        {t("expenses")}
                      </dt>
                      <dd className="mt-0.5 font-mono ltr-nums text-destructive">
                        {prop.expensesThisMonth.toLocaleString()}{" "}
                        <span className="text-[10px] text-text-secondary">{CURRENCY.code}</span>
                      </dd>
                    </div>
                    <div className="col-span-2 border-t border-border/40 pt-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                        {t("net")}
                      </dt>
                      <dd
                        className={`mt-0.5 font-mono ltr-nums font-semibold ${
                          prop.net >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {prop.net.toLocaleString()}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Export Reports */}
      <section className="bg-surface border border-border/60 rounded-xl p-6">
        <h2 className="text-base font-display font-semibold text-text-primary tracking-tight mb-5">
          {t("exportReports")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 stagger-children">
          {exportReports.map((report) => {
            const Icon = report.icon;
            return (
              <div
                key={report.id}
                className="flex items-start gap-3 rounded-lg border border-border/40 bg-surface-elevated/40 p-4 transition-colors hover:border-accent/30"
              >
                <div className={`shrink-0 rounded-lg p-2 ${report.bgColor}`}>
                  <Icon aria-hidden="true" className={`h-4 w-4 ${report.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary font-display">
                    {t(report.titleKey)}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                    {t(report.descKey)}
                  </p>
                  <Link
                    href={`/api/reports/${report.id}?format=csv`}
                    target="_blank"
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")}
                  >
                    <Download aria-hidden="true" className="h-3.5 w-3.5" />
                    {t("exportExcel")}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
