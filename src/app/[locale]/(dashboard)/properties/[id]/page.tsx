import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Plus,
  Home,
  Users,
  MapPin,
  TrendingUp,
  Wrench,
  Pencil,
} from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { UnitGrid, type UnitGridItem } from "@/components/units/unit-grid";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("properties");
  const tc = await getTranslations("common");
  const tu = await getTranslations("units");
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("is_archived", false)
    .single();

  if (!property) {
    notFound();
  }

  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null && !propertyIds.includes(id)) {
    notFound();
  }

  const { data: units } = await supabase
    .from("units")
    .select("*, leases(tenant_id, is_active, monthly_rent, tenants(full_name))")
    .eq("property_id", id)
    .order("unit_number");

  const allUnits = units || [];

  // Identify which active tenants in this property have cheques on file,
  // so we can flag occupied units whose tenant has none.
  const activeTenantIds = Array.from(
    new Set(
      allUnits
        .flatMap((u: Record<string, unknown>) =>
          ((u.leases as Record<string, unknown>[]) || []).filter(
            (l) => l.is_active === true
          )
        )
        .map((l: Record<string, unknown>) => l.tenant_id as string)
        .filter(Boolean)
    )
  );
  const tenantsWithCheques = new Set<string>();
  if (activeTenantIds.length > 0) {
    const { data: chequeRows } = await supabase
      .from("cheques")
      .select("tenant_id")
      .in("tenant_id", activeTenantIds);
    (chequeRows || []).forEach((c: { tenant_id: string }) => {
      if (c.tenant_id) tenantsWithCheques.add(c.tenant_id);
    });
  }
  const occupied = allUnits.filter(
    (u: Record<string, unknown>) => u.status === "occupied"
  );
  const vacant = allUnits.filter(
    (u: Record<string, unknown>) => u.status === "vacant"
  );
  const maintenance = allUnits.filter(
    (u: Record<string, unknown>) => u.status === "maintenance"
  );
  const occupancyRate =
    allUnits.length > 0
      ? Math.round((occupied.length / allUnits.length) * 100)
      : 0;
  const monthlyRevenue = occupied.reduce(
    (sum: number, u: Record<string, unknown>) =>
      sum + (Number(u.rent_amount) || 0),
    0
  );

  // Flatten the units into the shape <UnitGrid> expects so the client
  // component doesn't have to dig through nested lease objects.
  const unitsForGrid: UnitGridItem[] = allUnits.map((u: Record<string, unknown>) => {
    const leases = (u.leases as Record<string, unknown>[]) || [];
    const activeLease = leases.find((l) => l.is_active === true);
    const tenant = activeLease?.tenants as Record<string, unknown> | null;
    return {
      id: u.id as string,
      unit_number: (u.unit_number as string) || "",
      status: (u.status as string) || "vacant",
      bedrooms: (u.bedrooms as number | null) ?? null,
      unit_type: (u.unit_type as string | null) ?? null,
      rent_amount: (u.rent_amount as number | string | null) ?? null,
      active_tenant_name: (tenant?.full_name as string | undefined) ?? null,
      active_tenant_id: (activeLease?.tenant_id as string | undefined) ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={property.name}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/properties` },
          { label: property.name },
        ]}
      >
        <Link
          href={`/${locale}/properties/${id}/edit`}
          className="inline-flex items-center gap-2 h-10 px-4 bg-surface-elevated border border-border text-text-primary text-sm font-medium rounded-xl hover:border-accent/30 hover:text-accent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" />
          {t("editProperty")}
        </Link>
        <Link
          href={`/${locale}/properties/${id}/units/new`}
          className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {tu("addUnit")}
        </Link>
      </PageHeader>

      {/* Location + property type strip */}
      <div className="-mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
        <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-text-secondary/60" />
        <span>{property.location || t("noLocation")}</span>
        {property.property_type && (
          <Badge variant="secondary" className="uppercase tracking-wider">
            {t(`types.${property.property_type}`)}
          </Badge>
        )}
      </div>

      {/* Property Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 stagger-children">
        {[
          {
            label: t("totalUnits"),
            value: allUnits.length,
            icon: Home,
            color: "text-accent",
            bg: "bg-accent/10",
          },
          {
            label: tu("occupied"),
            value: occupied.length,
            icon: Users,
            color: "text-info",
            bg: "bg-info/10",
          },
          {
            label: tu("vacant"),
            value: vacant.length,
            icon: Home,
            color: "text-success",
            bg: "bg-success/10",
          },
          {
            label: tu("maintenance"),
            value: maintenance.length,
            icon: Wrench,
            color: "text-destructive",
            bg: "bg-destructive/10",
          },
          {
            label: t("occupancyRate"),
            value: `${occupancyRate}%`,
            icon: TrendingUp,
            color: "text-accent",
            bg: "bg-accent/10",
            progress: occupancyRate,
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-surface border border-border/60 rounded-xl p-4 transition-colors hover:border-border"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                  {stat.label}
                </span>
                <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                  <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${stat.color}`} />
                </div>
              </div>
              <p className="text-xl font-bold text-text-primary font-mono tabular-nums ltr-nums">
                {stat.value}
              </p>
              {stat.progress !== undefined && (
                <div className="mt-2 h-1.5 bg-border/50 rounded-full overflow-hidden">
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
      {monthlyRevenue > 0 && (
        <div className="bg-gradient-to-r from-accent/5 via-accent/8 to-success/5 border border-accent/20 rounded-xl p-4 flex items-center justify-between gap-3 animate-fade-in-up">
          <div>
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-0.5">
              {tc("monthlyRevenue")}
            </p>
            <p className="text-xl font-bold font-mono tabular-nums ltr-nums text-text-primary">
              {monthlyRevenue.toLocaleString("en-OM", {
                minimumFractionDigits: 2,
              })}
              <span className="text-xs font-sans font-normal text-text-secondary ms-1.5">
                {CURRENCY.code}
              </span>
            </p>
          </div>
          <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 shrink-0">
            <TrendingUp aria-hidden="true" className="h-5 w-5 text-accent" />
          </div>
        </div>
      )}

      {/* Units Grid */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-text-primary font-display tracking-tight">
            {tu("title")}
          </h2>
          {allUnits.length > 0 && (
            <span className="text-xs font-medium text-text-secondary bg-surface-elevated border border-border/40 px-2 py-0.5 rounded-md font-mono ltr-nums">
              {allUnits.length}
            </span>
          )}
        </div>

        {allUnits.length > 0 ? (
          <UnitGrid
            propertyId={id}
            locale={locale}
            units={unitsForGrid}
            tenantIdsWithCheques={Array.from(tenantsWithCheques)}
          />
        ) : (
          <EmptyState
            icon={<Home className="h-5 w-5" />}
            title={tu("noUnits")}
            description={tu("noUnitsDescription")}
            action={
              <Link
                href={`/${locale}/properties/${id}/units/new`}
                className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {tu("addUnit")}
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
