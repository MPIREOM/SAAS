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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserAccessiblePropertyIds, filterByProperties } from "@/lib/access-control";
import { CURRENCY, formatAmount } from "@/lib/currency";
import { buttonVariants } from "@/components/ui/button";

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
      bg: "bg-accent-tint",
    },
    {
      label: tu("occupied"),
      value: occupiedUnits,
      suffix: `/ ${totalUnits}`,
      icon: Users,
      color: "text-info",
      bg: "bg-info-tint",
    },
    {
      label: tu("vacant"),
      value: vacantUnits,
      icon: Home,
      color: "text-success",
      bg: "bg-success-tint",
    },
    {
      label: t("occupancyRate"),
      value: `${occupancyRate}%`,
      icon: TrendingUp,
      color: "text-accent",
      bg: "bg-accent-tint",
      progress: occupancyRate,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Link
          href={`/${locale}/properties/new`}
          className={buttonVariants()}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("createProperty")}
        </Link>
      </PageHeader>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-surface border border-border rounded-xl shadow-card p-3 sm:p-4"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] font-semibold text-text-secondary">
                  {stat.label}
                </span>
                <div aria-hidden="true" className={`ms-auto grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg ${stat.bg}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-[22px] sm:text-[28px] leading-tight font-bold text-text-primary tabular-nums">
                  {stat.value}
                </p>
                {stat.suffix && (
                  <span className="text-sm text-text-secondary tabular-nums">
                    {stat.suffix}
                  </span>
                )}
              </div>
              {stat.progress !== undefined && (
                <div className="mt-3 h-1.5 bg-sunken rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
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
        <div className="bg-surface border border-border rounded-xl shadow-card px-4 py-3.5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-text-secondary mb-0.5">
              {t("occupancyRate")} &middot; {tc("monthlyRevenue")}
            </p>
            <p className="text-2xl font-bold tabular-nums text-text-primary">
              {formatAmount(totalRevenue)}
              <span className="text-sm font-semibold text-text-secondary ms-1.5">
                {CURRENCY.code}
              </span>
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-end">
              <p className="text-xs text-text-secondary">{tu("occupied")}</p>
              <p className="text-lg font-bold tabular-nums text-info">{occupiedUnits}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-end">
              <p className="text-xs text-text-secondary">{tu("vacant")}</p>
              <p className="text-lg font-bold tabular-nums text-success">{vacantUnits}</p>
            </div>
          </div>
        </div>
      )}

      {/* Properties Grid */}
      {properties && properties.length > 0 ? (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                className="bg-surface border border-border rounded-xl shadow-card hover:border-border-strong hover:bg-surface-elevated transition-colors duration-150 group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-lg bg-accent-tint text-accent-tint-foreground">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 text-text-tertiary group-hover:text-text-secondary transition-all duration-200 translate-x-0 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  </div>

                  <h3 className="text-[15px] font-semibold text-text-primary font-display">
                    {property.name as string}
                  </h3>

                  {Boolean(property.location) && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <MapPin className="h-3.5 w-3.5 text-text-tertiary" />
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
                        <span className="text-xs font-bold tabular-nums text-text-primary">
                          {propOccRate}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-sunken rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-500"
                          style={{ width: `${propOccRate}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
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
                      <span className="text-sm font-bold tabular-nums ltr-nums text-text-primary ms-auto">
                        {formatAmount(propRevenue)}
                        <small className="ms-1 text-xs font-medium text-text-secondary">{CURRENCY.code}</small>
                      </span>
                    )}
                  </div>

                  {/* Property type badge */}
                  <div className="mt-3">
                    <Badge variant="secondary">
                      {property.property_type
                        ? t(`types.${property.property_type as string}`)
                        : "—"}
                    </Badge>
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
              className={buttonVariants()}
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
