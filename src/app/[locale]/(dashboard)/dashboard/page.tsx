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
import { CURRENCY } from "@/lib/currency";
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
  label: string;
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

  // Pre-fetch accessible unit IDs for filtering maintenance requests
  let accessibleUnitIds: string[] = [];
  if (propertyIds !== null) {
    const { data: accUnits } = await supabase.from("units").select("id").in("property_id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
    accessibleUnitIds = (accUnits || []).map((u) => u.id);
  }

  // Units for filtering invoices
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
    { data: vacantUnitsData },
  ] = await Promise.all([
    propertiesQuery,
    unitsQuery,
    occupiedQuery,
    supabase.from("tenants").select("*", { count: "exact", head: true }).eq("status", "active"),
    (() => {
      let mq = supabase.from("maintenance_requests").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress"]);
      if (propertyIds !== null) {
        mq = mq.in("unit_id", accessibleUnitIds.length > 0 ? accessibleUnitIds : ["__no_access__"]);
      }
      return mq;
    })(),
    expensesQuery,
    unitsForInvoicesQuery,
    vacantUnitsQuery,
  ]);

  // Revenue this month (paid invoices)
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
      { label: "0-30 days", count: 0, total: 0, color: "bg-warning/20 text-warning" },
      { label: "31-60 days", count: 0, total: 0, color: "bg-warning/30 text-warning" },
      { label: "61-90 days", count: 0, total: 0, color: "bg-destructive/20 text-destructive" },
      { label: "90+ days", count: 0, total: 0, color: "bg-destructive/30 text-destructive" },
    ];
  }

  const buckets = [
    { label: "0-30 days", min: 0, max: 30, count: 0, total: 0, color: "bg-warning/20 text-warning" },
    { label: "31-60 days", min: 31, max: 60, count: 0, total: 0, color: "bg-warning/30 text-warning" },
    { label: "61-90 days", min: 61, max: 90, count: 0, total: 0, color: "bg-destructive/20 text-destructive" },
    { label: "90+ days", min: 91, max: Infinity, count: 0, total: 0, color: "bg-destructive/30 text-destructive" },
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
    label: b.label,
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
  const [stats, overdueInvoices, recentInvoices, expiringLeases, agedReceivables, upcomingCheques, expiringDocuments] = await Promise.all([
    getDashboardStats(month, year),
    getOverdueInvoices(),
    getRecentInvoices(),
    getExpiringLeases(),
    getAgedReceivables(),
    getUpcomingCheques(),
    getExpiringDocuments(),
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
      value: `${stats.revenueThisMonth.toLocaleString()} ${CURRENCY.code}`,
      hint: t("collectionRate"),
      icon: DollarSign,
      tone: "success" as const,
      href: `/${locale}/reports`,
    },
    {
      label: t("netIncome"),
      value: `${stats.netIncome.toLocaleString()} ${CURRENCY.code}`,
      hint: `${t("expensesThisMonth")}: ${stats.expensesThisMonth.toLocaleString()} ${CURRENCY.code}`,
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
        ? `${totalOverdueAmount.toLocaleString()} ${CURRENCY.code}`
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
      value: `${stats.expensesThisMonth.toLocaleString()} ${CURRENCY.code}`,
      icon: Receipt,
      tone: "default" as const,
      href: `/${locale}/expenses`,
    },
    {
      label: t("vacancyCost"),
      value: `${stats.vacancyCost.toLocaleString()} ${CURRENCY.code}`,
      icon: PiggyBank,
      tone: stats.vacancyCost > 0 ? ("warning" as const) : ("default" as const),
      href: `/${locale}/properties`,
    },
  ];

  return (
    <div className="space-y-6">
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
          overdueLine: t("overdueAlertLine"),
          overdueCta: t("reviewOverdue"),
          vacantLine: t("vacantAlertLine"),
          vacantCta: t("viewVacancies"),
          dismiss: t("dismissAlert"),
        }}
      />

      {/* Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex items-center gap-2 h-9 px-4 bg-surface border border-border/50 rounded-lg text-sm text-text-secondary hover:text-accent hover:border-accent/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              {action.label}
            </Link>
          );
        })}
      </div>

      {/* Hero KPIs — primary row */}
      <section aria-labelledby="primary-metrics-heading">
        <h2
          id="primary-metrics-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-secondary"
        >
          {t("primaryMetrics")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          {heroTiles.map((tile) => (
            <StatTilePrimary key={tile.label} {...tile} />
          ))}
        </div>
      </section>

      {/* Secondary KPIs — supporting counts */}
      <section aria-labelledby="snapshot-heading">
        <h2
          id="snapshot-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-secondary"
        >
          {t("portfolioSnapshot")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger-children">
          {secondaryTiles.map((tile) => (
            <StatTileSecondary key={tile.label} {...tile} />
          ))}
        </div>
      </section>

      {/* Rent Collection Chart */}
      <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
            {t("rentCollection")}
          </h3>
          <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        </div>
        <RentChart propertyIds={stats.propertyIds} />
      </div>

      {/* Cash Flow + Occupancy Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
              {t("cashFlowTrend")}
            </h3>
            <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          </div>
          <CashFlowChart propertyIds={stats.propertyIds} />
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
              {t("occupancyTrend")}
            </h3>
            <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          </div>
          <OccupancyChart propertyIds={stats.propertyIds} />
        </div>
      </div>

      {/* Revenue by Property + Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "350ms" }}>
          <h3 className="text-base font-display font-semibold text-text-primary tracking-tight mb-4">
            {t("revenueByProperty")}
          </h3>
          <RevenueByPropertyChart propertyIds={stats.propertyIds} />
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "400ms" }}>
          <h3 className="text-base font-display font-semibold text-text-primary tracking-tight mb-4">
            {t("paymentMethods")}
          </h3>
          <PaymentMethodChart />
        </div>
      </div>

      {/* Aged Receivables */}
      <div className="bg-surface border border-border rounded-xl p-6 animate-fade-in-up" style={{ animationDelay: "450ms" }}>
        <div className="flex items-center gap-3 mb-5">
          <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
            {t("agedReceivables")}
          </h3>
          {totalAgedReceivables > 0 && (
            <span className="text-xs bg-destructive/12 text-destructive px-2.5 py-1 rounded-md font-mono font-semibold border border-destructive/20">
              {totalAgedReceivables.toLocaleString()} {CURRENCY.code}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {agedReceivables.map((bucket) => (
            <div
              key={bucket.label}
              className={`rounded-lg p-4 border border-border/30 ${bucket.color.split(" ")[0]}`}
            >
              <p className={`text-xs font-semibold uppercase tracking-wider ${bucket.color.split(" ")[1]}`}>
                {bucket.label}
              </p>
              <p className="text-2xl font-display font-bold text-text-primary mt-2 ltr-nums">
                {bucket.total.toLocaleString()} <span className="text-sm font-normal text-text-secondary">{CURRENCY.code}</span>
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {bucket.count} {t("invoicesCount")}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom grid: Recent Invoices + Overdue + Cheques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children">
        {/* Recent Invoices */}
        <div className="bg-surface border border-border rounded-xl p-6">
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
                  <div className="text-end shrink-0 ms-3 flex items-center gap-2.5">
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
        <div className="bg-surface border border-border rounded-xl p-6">
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
                  <div className="text-end shrink-0 ms-3">
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

        {/* Upcoming Cheques */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
              {t("upcomingCheques")}
            </h3>
            {upcomingCheques.length > 0 && (
              <span className="text-xs bg-accent/12 text-accent px-2.5 py-1 rounded-md font-mono font-semibold border border-accent/20">
                {upcomingCheques.length}
              </span>
            )}
          </div>
          {upcomingCheques.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-secondary">
              <div className="h-12 w-12 rounded-xl bg-surface-elevated flex items-center justify-center mb-3">
                <CreditCard className="h-5 w-5 opacity-40" />
              </div>
              <p className="text-sm">{t("noUpcomingCheques")}</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {upcomingCheques.map((cheque) => (
                <div
                  key={cheque.id}
                  className={`flex items-center justify-between p-3.5 rounded-lg border transition-colors ${
                    cheque.daysUntil <= 7
                      ? "bg-warning/5 border-warning/15 hover:border-warning/30"
                      : "bg-surface-elevated/50 border-border/30 hover:border-accent/30"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {cheque.tenantName}
                    </p>
                    {(cheque.propertyName || cheque.unitNumber) && (
                      <p className="text-xs text-text-secondary truncate mt-0.5">
                        {cheque.propertyName || "?"}
                        {cheque.unitNumber && ` · Unit ${cheque.unitNumber}`}
                      </p>
                    )}
                    <p className="text-xs text-text-secondary truncate mt-0.5">
                      #{cheque.chequeNumber} &middot; {cheque.bankName}
                    </p>
                  </div>
                  <div className="text-end shrink-0 ms-3">
                    <p className="text-sm font-bold font-mono text-text-primary ltr-nums">
                      {cheque.amount} {CURRENCY.code}
                    </p>
                    <p className={`text-xs mt-0.5 ${cheque.daysUntil <= 7 ? "text-warning font-medium" : "text-text-secondary"}`}>
                      {cheque.daysUntil <= 0 ? t("dueToday") : `${cheque.daysUntil}d`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expiring Documents */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <h3 className="text-base font-display font-semibold text-text-primary tracking-tight">
              {t("expiringDocuments")}
            </h3>
            {expiringDocuments.length > 0 && (
              <span className="text-xs bg-warning/12 text-warning px-2.5 py-1 rounded-md font-mono font-semibold border border-warning/20">
                {expiringDocuments.length}
              </span>
            )}
          </div>
          {expiringDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-secondary">
              <div className="h-12 w-12 rounded-xl bg-surface-elevated flex items-center justify-center mb-3">
                <ShieldAlert className="h-5 w-5 opacity-40" />
              </div>
              <p className="text-sm">{t("noExpiringDocuments")}</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {expiringDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between p-3.5 rounded-lg border transition-colors ${
                    doc.daysUntil <= 0
                      ? "bg-destructive/5 border-destructive/15"
                      : doc.daysUntil <= 14
                      ? "bg-warning/5 border-warning/15"
                      : "bg-surface-elevated/50 border-border/30"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {doc.entityName}
                    </p>
                    <p className="text-xs text-text-secondary truncate mt-0.5 capitalize">
                      {doc.documentType}
                    </p>
                  </div>
                  <div className="text-end shrink-0 ms-3">
                    <p className="text-sm font-mono text-text-primary ltr-nums">
                      {new Date(doc.expiryDate).toLocaleDateString()}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      doc.daysUntil <= 0 ? "text-destructive font-medium" : doc.daysUntil <= 14 ? "text-warning font-medium" : "text-text-secondary"
                    }`}>
                      {doc.daysUntil <= 0 ? t("expired") : `${doc.daysUntil}d ${t("daysLeft")}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Lease Expirations */}
        <div className="bg-surface border border-border rounded-xl p-6">
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
                  <div className="text-end shrink-0 ms-3">
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
