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
  CreditCard,
  DollarSign,
  ShieldAlert,
  PiggyBank,
} from "lucide-react";
import { RentChart } from "@/components/dashboard/rent-chart";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { OccupancyChart } from "@/components/dashboard/occupancy-chart";
import { PaymentMethodChart } from "@/components/dashboard/payment-method-chart";
import { RevenueByPropertyChart } from "@/components/dashboard/revenue-by-property-chart";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { PageHeader } from "@/components/ui/page-header";
import { HeroAlertStrip } from "@/components/dashboard/hero-alert-strip";
import { StatTilePrimary, StatTileSecondary } from "@/components/dashboard/stat-tile";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { CURRENCY, formatAmount } from "@/lib/currency";
import { format } from "date-fns";
import { getUserAccessiblePropertyIds, filterByProperties } from "@/lib/access-control";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */

interface OverdueInvoice {
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  amount: string;
  daysOverdue: number;
  invoiceId: string;
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

interface AgedBucket {
  labelKey: "aged0to30" | "aged31to60" | "aged61to90" | "aged90plus";
  count: number;
  total: number;
  color: string;
}

interface UpcomingCheque {
  id: string;
  tenantName: string;
  chequeNumber: string;
  bankName: string;
  amount: string;
  chequeDate: string;
  daysUntil: number;
  propertyName: string | null;
  unitNumber: string | null;
}

interface ExpiringDocument {
  id: string;
  entityName: string;
  documentType: string;
  expiryDate: string;
  daysUntil: number;
}

/* ------------------------------------------------------------------ */
/*  Data-fetching helpers                                              */
/* ------------------------------------------------------------------ */

async function getDashboardStats(selectedMonth?: string, selectedYear?: string) {
  const supabase = await createClient();
  const propertyIds = await getUserAccessiblePropertyIds(supabase);

  const now = new Date();
  const month = selectedMonth ? parseInt(selectedMonth) - 1 : now.getMonth();
  const year = selectedYear ? parseInt(selectedYear) : now.getFullYear();
  const monthStart = format(new Date(year, month, 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(year, month + 1, 0), "yyyy-MM-dd");

  const noAccessFilter = ["__no_access__"];
  const restrictedPropertyIds =
    propertyIds !== null && propertyIds.length === 0 ? noAccessFilter : propertyIds;

  // Properties query
  let propertiesQuery = supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("is_archived", false);
  propertiesQuery = filterByProperties(propertiesQuery, propertyIds, "id");

  // Units query
  let unitsQuery = supabase
    .from("units")
    .select("*", { count: "exact", head: true });
  unitsQuery = filterByProperties(unitsQuery, propertyIds);

  // Occupied units
  let occupiedQuery = supabase
    .from("units")
    .select("*", { count: "exact", head: true })
    .eq("status", "occupied");
  occupiedQuery = filterByProperties(occupiedQuery, propertyIds);

  // Vacant units
  let vacantUnitsQuery = supabase
    .from("units")
    .select("id, rent_amount")
    .eq("status", "vacant");
  vacantUnitsQuery = filterByProperties(vacantUnitsQuery, propertyIds);

  // Expenses this month
  let expensesQuery = supabase
    .from("expenses")
    .select("amount")
    .gte("expense_date", monthStart)
    .lte("expense_date", monthEnd);
  expensesQuery = filterByProperties(expensesQuery, propertyIds);

  // Open maintenance requests — restricted users filter through the joined
  // unit's property_id, so no unit-ID prefetch round-trip is needed.
  const maintenanceQuery =
    restrictedPropertyIds !== null
      ? supabase
          .from("maintenance_requests")
          .select("*, units!inner(property_id)", { count: "exact", head: true })
          .in("status", ["open", "in_progress"])
          .in("units.property_id", restrictedPropertyIds)
      : supabase
          .from("maintenance_requests")
          .select("*", { count: "exact", head: true })
          .in("status", ["open", "in_progress"]);

  // Revenue this month (paid invoices), joined through units the same way
  let revenueQuery = supabase
    .from("invoices")
    .select(
      restrictedPropertyIds !== null
        ? "amount, units!inner(property_id)"
        : "amount"
    )
    .eq("status", "paid")
    .gte("due_date", monthStart)
    .lte("due_date", monthEnd);
  if (restrictedPropertyIds !== null) {
    revenueQuery = revenueQuery.in("units.property_id", restrictedPropertyIds);
  }

  // Everything runs in one parallel batch — the old version chained three
  // extra sequential round-trips (unit-ID prefetches + revenue) after it.
  const [
    { count: propertyCount },
    { count: unitCount },
    { count: occupiedCount },
    { count: tenantCount },
    { count: openMaintenanceCount },
    { data: expensesData },
    { data: vacantUnitsData },
    { data: paidInvoices },
  ] = await Promise.all([
    propertiesQuery,
    unitsQuery,
    occupiedQuery,
    supabase.from("tenants").select("*", { count: "exact", head: true }).eq("status", "active"),
    maintenanceQuery,
    expensesQuery,
    vacantUnitsQuery,
    revenueQuery,
  ]);

  // Cast: the conditional select string defeats the client's literal-type
  // parser; only `amount` is read here.
  const revenueThisMonth = ((paidInvoices || []) as unknown as { amount: string }[]).reduce(
    (sum, inv) => sum + parseFloat(inv.amount), 0
  );

  const expensesThisMonth = (expensesData || []).reduce(
    (sum, exp) => sum + parseFloat(exp.amount as string), 0
  );
  const netIncome = Math.round((revenueThisMonth - expensesThisMonth) * 100) / 100;
  const occupancyRate = unitCount ? Math.round(((occupiedCount || 0) / unitCount) * 100) : 0;

  // Vacancy cost = sum of rent_amount for vacant units
  const vacancyCost = (vacantUnitsData || []).reduce(
    (sum, u) => sum + parseFloat((u.rent_amount as string) || "0"), 0
  );

  return {
    propertyCount: propertyCount || 0,
    unitCount: unitCount || 0,
    occupiedCount: occupiedCount || 0,
    vacantCount: (unitCount || 0) - (occupiedCount || 0),
    tenantCount: tenantCount || 0,
    openMaintenanceCount: openMaintenanceCount || 0,
    occupancyRate,
    expensesThisMonth: Math.round(expensesThisMonth * 100) / 100,
    netIncome,
    revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
    vacancyCost: Math.round(vacancyCost * 100) / 100,
    propertyIds,
  };
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
    .in("status", ["pending", "overdue", "partial"])
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

async function getAgedReceivables(): Promise<AgedBucket[]> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("amount, due_date, paid_amount")
    .in("status", ["pending", "overdue", "partial"])
    .lt("due_date", todayStr);

  if (!invoices || invoices.length === 0) {
    return [
      { labelKey: "aged0to30" as const, count: 0, total: 0, color: "bg-warning/20 text-warning" },
      { labelKey: "aged31to60" as const, count: 0, total: 0, color: "bg-warning/30 text-warning" },
      { labelKey: "aged61to90" as const, count: 0, total: 0, color: "bg-destructive/20 text-destructive" },
      { labelKey: "aged90plus" as const, count: 0, total: 0, color: "bg-destructive/30 text-destructive" },
    ];
  }

  const buckets = [
    { labelKey: "aged0to30" as const, min: 0, max: 30, count: 0, total: 0, color: "bg-warning/20 text-warning" },
    { labelKey: "aged31to60" as const, min: 31, max: 60, count: 0, total: 0, color: "bg-warning/30 text-warning" },
    { labelKey: "aged61to90" as const, min: 61, max: 90, count: 0, total: 0, color: "bg-destructive/20 text-destructive" },
    { labelKey: "aged90plus" as const, min: 91, max: Infinity, count: 0, total: 0, color: "bg-destructive/30 text-destructive" },
  ];

  invoices.forEach((inv) => {
    const dueDate = new Date(inv.due_date);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const outstanding = parseFloat(inv.amount as string) - parseFloat((inv.paid_amount as string) || "0");
    if (outstanding <= 0) return;

    for (const bucket of buckets) {
      if (daysOverdue >= bucket.min && daysOverdue <= bucket.max) {
        bucket.count++;
        bucket.total += outstanding;
        break;
      }
    }
  });

  return buckets.map((b) => ({
    labelKey: b.labelKey,
    count: b.count,
    total: Math.round(b.total * 100) / 100,
    color: b.color,
  }));
}

async function getUpcomingCheques(): Promise<UpcomingCheque[]> {
  const supabase = await createClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysOut = format(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd"
  );

  // Pull cheques + the property/unit they belong to. Prefer the invoice
  // link (most reliable for cheques tied to a specific invoice); fall back
  // to the tenant's currently-active lease when invoice_id is null. Both
  // paths are joined inline so this stays a single round-trip.
  const { data } = await supabase
    .from("cheques")
    .select(
      `id, cheque_number, bank_name, cheque_date, amount, invoice_id,
       tenants!inner(
         full_name,
         leases(is_active, units(unit_number, properties(name)))
       ),
       invoices(units(unit_number, properties(name)))`,
    )
    .eq("status", "pending")
    .gte("cheque_date", today)
    .lte("cheque_date", thirtyDaysOut)
    .order("cheque_date", { ascending: true })
    .limit(8);

  if (!data) return [];
  const now = new Date();
  return data.map((c) => {
    const tenant = c.tenants as unknown as {
      full_name: string;
      leases?: Array<{
        is_active: boolean;
        units?: { unit_number?: string; properties?: { name?: string } } | null;
      }>;
    };
    const invoice = c.invoices as unknown as
      | { units?: { unit_number?: string; properties?: { name?: string } } | null }
      | null;
    const chequeDate = new Date(c.cheque_date);

    // Prefer the unit/property from the linked invoice; fall back to the
    // tenant's first active lease so cheques without an invoice link still
    // show context.
    const invoiceUnit = invoice?.units || null;
    const activeLeaseUnit = tenant.leases?.find((l) => l.is_active)?.units || null;
    const resolved = invoiceUnit || activeLeaseUnit;

    return {
      id: c.id,
      tenantName: tenant.full_name,
      chequeNumber: c.cheque_number,
      bankName: c.bank_name,
      amount: c.amount,
      chequeDate: c.cheque_date,
      daysUntil: Math.ceil((chequeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      unitNumber: resolved?.unit_number || null,
      propertyName: resolved?.properties?.name || null,
    };
  });
}

async function getExpiringDocuments(): Promise<ExpiringDocument[]> {
  const supabase = await createClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const sixtyDaysOut = format(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd"
  );

  const { data } = await supabase
    .from("documents")
    .select("id, entity_type, entity_id, document_type, expiry_date")
    .not("expiry_date", "is", null)
    .lte("expiry_date", sixtyDaysOut)
    .order("expiry_date", { ascending: true })
    .limit(8);

  if (!data || data.length === 0) return [];

  // Resolve entity names
  const tenantIds = data.filter((d) => d.entity_type === "tenant").map((d) => d.entity_id);
  const propertyIds = data.filter((d) => d.entity_type === "property").map((d) => d.entity_id);

  const [{ data: tenants }, { data: properties }] = await Promise.all([
    tenantIds.length > 0
      ? supabase.from("tenants").select("id, full_name").in("id", tenantIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    propertyIds.length > 0
      ? supabase.from("properties").select("id, name").in("id", propertyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const tenantMap = new Map((tenants || []).map((t) => [t.id, t.full_name]));
  const propMap = new Map((properties || []).map((p) => [p.id, p.name]));
  const now = new Date();

  return data.map((d) => {
    const entityName = d.entity_type === "tenant"
      ? tenantMap.get(d.entity_id) || "Unknown"
      : propMap.get(d.entity_id) || "Unknown";
    const expiryDate = new Date(d.expiry_date);
    return {
      id: d.id,
      entityName,
      documentType: (d.document_type as string).replace(/_/g, " "),
      expiryDate: d.expiry_date,
      daysUntil: Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    };
  });
}

// Buildings whose spare gate keys are at or below the reorder level (054).
// RLS limits properties to the ones the user can see.
async function getLowGateKeyStock() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("id, name, gate_key_stock, gate_key_low_threshold")
    .eq("is_archived", false)
    .not("gate_key_stock", "is", null)
    .order("name");
  return (data || [])
    .filter((p) => Number(p.gate_key_stock) <= Number(p.gate_key_low_threshold))
    .map((p) => ({ id: p.id as string, name: p.name as string, stock: Number(p.gate_key_stock) }));
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const { locale } = await params;
  const { month, year } = await searchParams;
  const t = await getTranslations("dashboard");
  const tInvoices = await getTranslations("invoices");
  const [stats, overdueInvoices, recentInvoices, expiringLeases, agedReceivables, upcomingCheques, expiringDocuments, lowGateKeys] = await Promise.all([
    getDashboardStats(month, year),
    getOverdueInvoices(),
    getRecentInvoices(),
    getExpiringLeases(),
    getAgedReceivables(),
    getUpcomingCheques(),
    getExpiringDocuments(),
    getLowGateKeyStock(),
  ]);

  const totalAgedReceivables = agedReceivables.reduce((sum, b) => sum + b.total, 0);

  const quickActions = [
    { label: t("addTenant"), href: `/${locale}/tenants/new`, icon: UserPlus },
    { label: t("addProperty"), href: `/${locale}/properties/new`, icon: Building2 },
    { label: t("newMaintenance"), href: `/${locale}/maintenance/new`, icon: Wrench },
    { label: t("sendReminders"), href: `/${locale}/reminders`, icon: Bell },
  ];

  // Compute total overdue amount for the hero alert (count alone is buried).
  const totalOverdueAmount = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.amount || 0),
    0
  );

  // Hero KPIs — the four numbers management cares about first.
  const heroTiles = [
    {
      label: t("revenueThisMonth"),
      value: `${formatAmount(stats.revenueThisMonth)} ${CURRENCY.code}`,
      hint: t("collectionRate"),
      icon: DollarSign,
      tone: "success" as const,
      href: `/${locale}/reports`,
    },
    {
      label: t("netIncome"),
      value: `${formatAmount(stats.netIncome)} ${CURRENCY.code}`,
      hint: `${t("expensesThisMonth")}: ${formatAmount(stats.expensesThisMonth)} ${CURRENCY.code}`,
      icon: TrendingUp,
      tone: stats.netIncome >= 0 ? ("success" as const) : ("destructive" as const),
      href: `/${locale}/reports`,
    },
    {
      label: t("occupancyRate"),
      value: `${stats.occupancyRate}%`,
      hint: `${stats.occupiedCount} / ${stats.unitCount} ${t("totalUnits").toLowerCase()}`,
      icon: TrendingUp,
      tone: "info" as const,
      href: `/${locale}/properties`,
    },
    {
      label: t("overdueInvoices"),
      value: overdueInvoices.length,
      hint: overdueInvoices.length > 0
        ? `${formatAmount(totalOverdueAmount)} ${CURRENCY.code}`
        : t("noOverdueInvoices"),
      icon: AlertTriangle,
      tone: overdueInvoices.length > 0 ? ("destructive" as const) : ("default" as const),
      href: `/${locale}/invoices?status=pending`,
    },
  ];

  // Secondary KPIs — supporting counts that don't need to dominate.
  const secondaryTiles = [
    {
      label: t("totalProperties"),
      value: stats.propertyCount,
      icon: Building2,
      tone: "default" as const,
      href: `/${locale}/properties`,
    },
    {
      label: t("totalUnits"),
      value: stats.unitCount,
      icon: Home,
      tone: "default" as const,
      href: `/${locale}/properties`,
    },
    {
      label: t("activeTenants"),
      value: stats.tenantCount,
      icon: Users,
      tone: "default" as const,
      href: `/${locale}/tenants`,
    },
    {
      label: t("openMaintenance"),
      value: stats.openMaintenanceCount,
      icon: Wrench,
      tone: stats.openMaintenanceCount > 0 ? ("warning" as const) : ("default" as const),
      href: `/${locale}/maintenance`,
    },
    {
      label: t("expensesThisMonth"),
      value: `${formatAmount(stats.expensesThisMonth)} ${CURRENCY.code}`,
      icon: Receipt,
      tone: "default" as const,
      href: `/${locale}/expenses`,
    },
    {
      label: t("vacancyCost"),
      value: `${formatAmount(stats.vacancyCost)} ${CURRENCY.code}`,
      icon: PiggyBank,
      tone: stats.vacancyCost > 0 ? ("warning" as const) : ("default" as const),
      href: `/${locale}/properties`,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <DateRangeFilter defaultMonth={month} defaultYear={year} />
      </PageHeader>

      {/* Hero alerts — only render when there's something to act on */}
      <HeroAlertStrip
        overdueCount={overdueInvoices.length}
        overdueAmount={totalOverdueAmount}
        vacantCount={stats.vacantCount}
        vacancyCost={stats.vacancyCost}
        invoicesHref={`/${locale}/invoices?status=pending`}
        propertiesHref={`/${locale}/properties`}
        labels={{
          overdueTitle: t("actionNeeded"),
          overdueLine: t.raw("overdueAlertLine"),
          overdueCta: t("reviewOverdue"),
          vacantLine: t.raw("vacantAlertLine"),
          vacantCta: t("viewVacancies"),
          dismiss: t("dismissAlert"),
        }}
      />

      {lowGateKeys.length > 0 && (
        <Alert variant="warning" title={t("gateKeysLowTitle")}>
          <ul className="mt-1 space-y-0.5 text-text-primary">
            {lowGateKeys.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${locale}/properties/${p.id}`}
                  className={cn("rounded hover:underline underline-offset-2", focusRing)}
                >
                  {t("gateKeysLowLine", { property: p.name, stock: p.stock })}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {action.label}
            </Link>
          );
        })}
      </div>

      {/* Hero KPIs — primary row */}
      <section aria-labelledby="primary-metrics-heading" className="flex flex-col gap-2.5">
        <h2 id="primary-metrics-heading" className={sectionLabel}>
          {t("primaryMetrics")}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {heroTiles.map((tile) => (
            <StatTilePrimary key={tile.label} {...tile} />
          ))}
        </div>
      </section>

      {/* Secondary KPIs — one strip, cells divided by 1px gaps */}
      <section aria-labelledby="snapshot-heading" className="flex flex-col gap-2.5">
        <h2 id="snapshot-heading" className={sectionLabel}>
          {t("portfolioSnapshot")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card">
          {secondaryTiles.map((tile) => (
            <StatTileSecondary key={tile.label} {...tile} />
          ))}
        </div>
      </section>

      {/* Rent Collection Chart */}
      <Panel title={t("rentCollection")}>
        <div className="p-4">
          <RentChart propertyIds={stats.propertyIds} />
        </div>
      </Panel>

      {/* Cash Flow + Occupancy Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={t("cashFlowTrend")}>
          <div className="p-4">
            <CashFlowChart propertyIds={stats.propertyIds} />
          </div>
        </Panel>
        <Panel title={t("occupancyTrend")}>
          <div className="p-4">
            <OccupancyChart propertyIds={stats.propertyIds} />
          </div>
        </Panel>
      </div>

      {/* Revenue by Property + Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={t("revenueByProperty")}>
          <div className="p-4">
            <RevenueByPropertyChart propertyIds={stats.propertyIds} />
          </div>
        </Panel>
        <Panel title={t("paymentMethods")}>
          <div className="p-4">
            <PaymentMethodChart />
          </div>
        </Panel>
      </div>

      {/* Aged Receivables */}
      <Panel
        title={t("agedReceivables")}
        count={
          totalAgedReceivables > 0
            ? `${formatAmount(totalAgedReceivables)} ${CURRENCY.code}`
            : undefined
        }
        countTone="destructive"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 p-4">
          {agedReceivables.map((bucket, i) => {
            const oldest = i === agedReceivables.length - 1;
            const share = totalAgedReceivables > 0 ? (bucket.total / totalAgedReceivables) * 100 : 0;
            return (
              <div
                key={bucket.labelKey}
                className={cn(
                  "flex min-w-0 flex-col gap-1 rounded-[10px] border p-3.5",
                  oldest ? "border-destructive/30 bg-destructive-tint" : "border-border bg-surface-elevated"
                )}
              >
                <p
                  className={cn(
                    "flex items-center gap-2 text-[12.5px] font-semibold",
                    oldest ? "text-destructive-text" : "text-text-secondary"
                  )}
                >
                  <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-[3px]", agedSwatch[i])} />
                  {t(bucket.labelKey)}
                </p>
                <p
                  className={cn(
                    "text-lg sm:text-xl font-bold ltr-nums tabular-nums",
                    oldest ? "text-destructive-text" : "text-text-primary"
                  )}
                >
                  {formatAmount(bucket.total)}
                  <small className="ms-1 text-xs font-semibold text-text-secondary">{CURRENCY.code}</small>
                </p>
                <p className={cn("text-[12.5px]", oldest ? "text-destructive-text" : "text-text-tertiary")}>
                  {bucket.count} {t("invoicesCount")}
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  <div className={cn("h-full", agedSwatch[i])} style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Bottom grid: Recent Invoices + Overdue + Cheques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Invoices */}
        <Panel
          title={t("recentInvoices")}
          action={{ href: `/${locale}/invoices`, label: t("viewAll") }}
        >
          {recentInvoices.length === 0 ? (
            <EmptyState bare icon={<FileText className="h-5 w-5" />} title={t("noRecentInvoices")} />
          ) : (
            <ul>
              {recentInvoices.map((inv) => (
                <li key={inv.id} className={rowBorder}>
                  <Link href={`/${locale}/invoices`} className={cn(rowClass, "hover:bg-surface-elevated", focusRing, "focus-visible:outline-offset-[-2px]")}>
                    <div className="min-w-0">
                      <p className={rowTitle}>{inv.tenantName}</p>
                      <p className={cn(rowSub, "ltr-nums tabular-nums")}>
                        {new Date(inv.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className={rowEnd}>
                      <Amount value={inv.amount} />
                      <Badge
                        variant={
                          inv.status === "paid"
                            ? "success"
                            : inv.status === "overdue"
                            ? "destructive"
                            : "warning"
                        }
                        className="capitalize"
                      >
                        {["paid", "pending", "overdue", "partial"].includes(inv.status)
                          ? tInvoices(inv.status)
                          : inv.status}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Overdue Payments */}
        <Panel
          title={t("overdueInvoices")}
          count={overdueInvoices.length > 0 ? overdueInvoices.length : undefined}
          countTone="destructive"
          action={
            overdueInvoices.length > 0
              ? { href: `/${locale}/invoices?status=pending`, label: t("reviewOverdue") }
              : undefined
          }
        >
          {overdueInvoices.length === 0 ? (
            <EmptyState bare icon={<AlertTriangle className="h-5 w-5" />} title={t("noOverdueInvoices")} />
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {overdueInvoices.map((item) => (
                <li key={item.invoiceId} className={cn(rowBorder, rowClass)}>
                  <div className="min-w-0">
                    <p className={rowTitle}>{item.tenantName}</p>
                    <p className={rowSub}>
                      {item.propertyName} &middot; {t("unit")} {item.unitNumber}
                    </p>
                  </div>
                  <div className={rowEnd}>
                    <Amount value={item.amount} className="text-destructive-text" />
                    <Badge variant="destructive">{t("daysOverdue", { days: item.daysOverdue })}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Upcoming Cheques */}
        <Panel
          title={t("upcomingCheques")}
          count={upcomingCheques.length > 0 ? upcomingCheques.length : undefined}
          countTone="warning"
        >
          {upcomingCheques.length === 0 ? (
            <EmptyState bare icon={<CreditCard className="h-5 w-5" />} title={t("noUpcomingCheques")} />
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {upcomingCheques.map((cheque) => (
                <li key={cheque.id} className={cn(rowBorder, rowClass)}>
                  <span aria-hidden="true" className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-sunken text-text-secondary">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={rowTitle}>{cheque.tenantName}</p>
                    <p className={rowSub}>
                      {(cheque.propertyName || cheque.unitNumber) && (
                        <>
                          {cheque.propertyName || "—"}
                          {cheque.unitNumber && <> &middot; {t("unit")} {cheque.unitNumber}</>}
                          {" · "}
                        </>
                      )}
                      #{cheque.chequeNumber} &middot; {cheque.bankName}
                    </p>
                  </div>
                  <div className={rowEnd}>
                    <Amount value={cheque.amount} />
                    {cheque.daysUntil <= 7 ? (
                      <Badge variant="warning">
                        {cheque.daysUntil <= 0 ? t("dueToday") : t("inDays", { days: cheque.daysUntil })}
                      </Badge>
                    ) : (
                      <span className="text-[12.5px] text-text-tertiary">
                        {t("inDays", { days: cheque.daysUntil })}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Expiring Documents */}
        <Panel
          title={t("expiringDocuments")}
          count={expiringDocuments.length > 0 ? expiringDocuments.length : undefined}
          countTone="warning"
        >
          {expiringDocuments.length === 0 ? (
            <EmptyState bare icon={<ShieldAlert className="h-5 w-5" />} title={t("noExpiringDocuments")} />
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {expiringDocuments.map((doc) => (
                <li key={doc.id} className={cn(rowBorder, rowClass)}>
                  <div className="min-w-0">
                    <p className={rowTitle}>{doc.entityName}</p>
                    <p className={cn(rowSub, "capitalize")}>{doc.documentType}</p>
                  </div>
                  <div className={rowEnd}>
                    <span className="text-sm font-semibold text-text-primary ltr-nums tabular-nums">
                      {new Date(doc.expiryDate).toLocaleDateString()}
                    </span>
                    {doc.daysUntil <= 0 ? (
                      <Badge variant="destructive">{t("expired")}</Badge>
                    ) : doc.daysUntil <= 14 ? (
                      <Badge variant="warning">{`${doc.daysUntil} ${t("daysLeft")}`}</Badge>
                    ) : (
                      <span className="text-[12.5px] text-text-tertiary">{`${doc.daysUntil} ${t("daysLeft")}`}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Upcoming Lease Expirations */}
        <Panel title={t("upcomingLeaseExpirations")}>
          {expiringLeases.length === 0 ? (
            <EmptyState bare icon={<Calendar className="h-5 w-5" />} title={t("noUpcomingExpirations")} />
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {expiringLeases.map((lease, i) => (
                <li key={i} className={cn(rowBorder, rowClass)}>
                  <div className="min-w-0">
                    <p className={rowTitle}>{lease.tenantName}</p>
                    <p className={rowSub}>
                      {lease.propertyName} &middot; {t("unit")} {lease.unitNumber}
                    </p>
                  </div>
                  <div className={rowEnd}>
                    <span className="text-sm font-semibold text-text-primary ltr-nums tabular-nums">
                      {new Date(lease.endDate).toLocaleDateString()}
                    </span>
                    {lease.daysLeft <= 30 ? (
                      <Badge variant="warning">{`${lease.daysLeft} ${t("daysLeft")}`}</Badge>
                    ) : (
                      <span className="text-[12.5px] text-text-tertiary">{`${lease.daysLeft} ${t("daysLeft")}`}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Presentation helpers                                               */
/* ------------------------------------------------------------------ */

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const sectionLabel = "text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary rtl:normal-case rtl:tracking-normal";
const rowBorder = "border-b border-border last:border-b-0";
const rowClass = "flex min-h-14 items-center gap-3 px-4 py-3";
const rowTitle = "truncate text-sm font-semibold text-text-primary";
const rowSub = "mt-px truncate text-[12.5px] text-text-secondary";
const rowEnd = "ms-auto flex shrink-0 flex-col items-end gap-1 text-end";
// Aged-receivable buckets, youngest to oldest
const agedSwatch = ["bg-warning", "bg-chart-2", "bg-destructive", "bg-destructive-text"];

function Amount({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("text-sm font-semibold text-text-primary ltr-nums tabular-nums", className)}>
      {formatAmount(value)}
      <small className="ms-1 text-[0.78em] font-medium text-text-secondary">{CURRENCY.code}</small>
    </span>
  );
}

function Panel({
  title,
  count,
  countTone = "neutral",
  action,
  children,
}: {
  title: string;
  count?: string | number;
  countTone?: "neutral" | "destructive" | "warning";
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex min-h-[52px] items-center gap-2.5 border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
        {count !== undefined && (
          <span
            className={cn(
              "rounded-full px-2 py-px text-xs font-semibold ltr-nums tabular-nums",
              countTone === "destructive"
                ? "bg-destructive-tint text-destructive-text"
                : countTone === "warning"
                ? "bg-warning-tint text-warning"
                : "bg-neutral-tint text-text-secondary"
            )}
          >
            {count}
          </span>
        )}
        {action && (
          <Link
            href={action.href}
            className={cn("ms-auto rounded text-[13.5px] font-semibold text-accent hover:underline underline-offset-2", focusRing)}
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
