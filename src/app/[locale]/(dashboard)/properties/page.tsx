import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import {
  Building2,
  Plus,
  MapPin,
  Home,
  Users,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserAccessiblePropertyIds, filterByProperties } from "@/lib/access-control";
import { CURRENCY } from "@/lib/currency";

export default async function PropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page } = await searchParams;
  const t = await getTranslations("properties");
  const tc = await getTranslations("common");
  const tu = await getTranslations("units");
  const supabase = await createClient();

  const propertyIds = await getUserAccessiblePropertyIds(supabase);

  let propertiesQuery = supabase
    .from("properties")
    .select(`
      *,
      units(id, status, rent_amount)
    `)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  propertiesQuery = filterByProperties(propertiesQuery, propertyIds, "id");

  // Pagination
  const PAGE_SIZE = 24;
  const currentPage = Math.max(1, parseInt(page || "1", 10));

  // Get total count for pagination
  let countQuery = supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("is_archived", false);
  countQuery = filterByProperties(countQuery, propertyIds, "id");

  // Count and page load in parallel
  const [{ count: totalCount }, { data: properties }] = await Promise.all([
    countQuery,
    propertiesQuery.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
  ]);
  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

  // Compute portfolio-level stats
  const allUnits = properties?.flatMap(
    (p: Record<string, unknown>) => (p.units as Record<string, unknown>[]) || []
  ) || [];
  const totalUnits = allUnits.length;
  const occupiedUnits = allUnits.filter(
    (u: Record<string, unknown>) => u.status === "occupied"
  ).length;
  const vacantUnits = allUnits.filter(
    (u: Record<string, unknown>) => u.status === "vacant"
  ).length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const totalRevenue = allUnits
    .filter((u: Record<string, unknown>) => u.status === "occupied")
    .reduce((sum: number, u: Record<string, unknown>) => sum + (Number(u.rent_amount) || 0), 0);

  const stats = [
    {
      label: t("title"),
      value: properties?.length || 0,
      icon: Building2,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: tu("occupied"),
      value: occupiedUnits,
      suffix: `/ ${totalUnits}`,
      icon: Users,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: tu("vacant"),
      value: vacantUnits,
      icon: Home,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: t("occupancyRate"),
      value: `${occupancyRate}%`,
      icon: TrendingUp,
      color: "text-accent",
      bg: "bg-accent/10",
      progress: occupancyRate,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Link
          href={`/${locale}/properties/new`}
          className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("createProperty")}
        </Link>
      </PageHeader>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-surface border border-border rounded-xl p-5 hover:border-border/80 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {stat.label}
                </span>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold text-text-primary font-mono tabular-nums">
                  {stat.value}
                </p>
                {stat.suffix && (
                  <span className="text-sm text-text-secondary font-mono tabular-nums">
                    {stat.suffix}
                  </span>
                )}
              </div>
              {stat.progress !== undefined && (
                <div className="mt-3 h-1.5 bg-border/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-success transition-all duration-500"
                    style={{ width: `${stat.progress}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Monthly Revenue Banner */}
      {totalRevenue > 0 && (
        <div className="bg-gradient-to-r from-accent/5 via-accent/10 to-success/5 border border-accent/20 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
              {t("occupancyRate")} &middot; {tc("monthlyRevenue")}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-text-primary">
              {totalRevenue.toLocaleString("en-OM", { minimumFractionDigits: 2 })}
              <span className="text-sm font-sans font-normal text-text-secondary ms-1.5">
                {CURRENCY.code}
              </span>
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-end">
              <p className="text-xs text-text-secondary">{tu("occupied")}</p>
              <p className="text-lg font-bold font-mono tabular-nums text-info">{occupiedUnits}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-end">
              <p className="text-xs text-text-secondary">{tu("vacant")}</p>
              <p className="text-lg font-bold font-mono tabular-nums text-success">{vacantUnits}</p>
            </div>
          </div>
        </div>
      )}

      {/* Properties Grid */}
      {properties && properties.length > 0 ? (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
          {properties.map((property: Record<string, unknown>) => {
            const units = (property.units as Record<string, unknown>[]) || [];
            const propOccupied = units.filter((u) => u.status === "occupied").length;
            const propVacant = units.filter((u) => u.status === "vacant").length;
            const propMaintenance = units.filter((u) => u.status === "maintenance").length;
            const propTotal = units.length;
            const propOccRate = propTotal > 0 ? Math.round((propOccupied / propTotal) * 100) : 0;
            const propRevenue = units
              .filter((u) => u.status === "occupied")
              .reduce((sum, u) => sum + (Number(u.rent_amount) || 0), 0);

            return (
              <Link
                key={property.id as string}
                href={`/${locale}/properties/${property.id}`}
                className="bg-surface border border-border rounded-xl p-0 hover:border-accent/30 transition-all duration-200 group overflow-hidden hover:shadow-lg hover:shadow-black/5"
              >
                {/* Top accent bar */}
                <div className="h-1 bg-gradient-to-r from-accent/60 to-accent/20" />

                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2.5 bg-accent/10 rounded-xl group-hover:bg-accent/15 transition-colors">
                      <Building2 className="h-5 w-5 text-accent" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-text-secondary/0 group-hover:text-text-secondary transition-all duration-200 translate-x-0 group-hover:translate-x-0.5" />
                  </div>

                  <h3 className="text-base font-semibold text-text-primary group-hover:text-accent transition-colors font-display tracking-tight">
                    {property.name as string}
                  </h3>

                  {Boolean(property.location) && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <MapPin className="h-3.5 w-3.5 text-text-secondary/60" />
                      <span className="text-xs text-text-secondary">
                        {property.location as string}
                      </span>
                    </div>
                  )}

                  {/* Occupancy bar */}
                  {propTotal > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-text-secondary">
                          {t("occupancyRate")}
                        </span>
                        <span className="text-xs font-bold font-mono tabular-nums text-text-primary">
                          {propOccRate}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-border/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent to-success transition-all duration-500"
                          style={{ width: `${propOccRate}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/60">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-info" />
                      <span className="text-xs font-medium text-text-secondary">
                        {propOccupied} {tu("occupied")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-success" />
                      <span className="text-xs font-medium text-text-secondary">
                        {propVacant} {tu("vacant")}
                      </span>
                    </div>
                    {propMaintenance > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-destructive" />
                        <span className="text-xs font-medium text-text-secondary">
                          {propMaintenance}
                        </span>
                      </div>
                    )}
                    {propRevenue > 0 && (
                      <span className="text-xs font-bold font-mono tabular-nums text-accent ml-auto">
                        {propRevenue.toLocaleString("en-OM", { minimumFractionDigits: 0 })} {CURRENCY.code}
                      </span>
                    )}
                  </div>

                  {/* Property type badge */}
                  <div className="mt-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary/70 bg-surface-elevated px-2 py-0.5 rounded-md">
                      {property.property_type
                        ? t(`types.${property.property_type as string}`)
                        : "—"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          baseUrl={`/${locale}/properties`}
          searchParams={{}}
        />
        </>
      ) : (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title={t("noProperties")}
          description={t("noPropertiesDescription")}
          action={
            <Link
              href={`/${locale}/properties/new`}
              className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t("createProperty")}
            </Link>
          }
        />
      )}
    </div>
  );
}
