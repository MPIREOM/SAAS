import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Building2,
  Plus,
  Home,
  ArrowLeft,
  Users,
  MapPin,
  TrendingUp,
  Wrench,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";

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

  const statusConfig: Record<
    string,
    { bg: string; text: string; dot: string; border: string }
  > = {
    vacant: {
      bg: "bg-success/5",
      text: "text-success",
      dot: "bg-success",
      border: "border-success/20 hover:border-success/40",
    },
    occupied: {
      bg: "bg-info/5",
      text: "text-info",
      dot: "bg-info",
      border: "border-info/20 hover:border-info/40",
    },
    maintenance: {
      bg: "bg-warning/5",
      text: "text-warning",
      dot: "bg-warning",
      border: "border-warning/20 hover:border-warning/40",
    },
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href={`/${locale}/properties`}
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all duration-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-text-primary font-display tracking-tight">
                {property.name}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <MapPin className="h-3.5 w-3.5 text-text-secondary/60" />
                <span className="text-sm text-text-secondary">
                  {property.location || t("noLocation")}
                </span>
                {property.property_type && (
                  <>
                    <span className="text-text-secondary/30 mx-1">&middot;</span>
                    <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary/70 bg-surface-elevated px-2 py-0.5 rounded-md">
                      {t(`types.${property.property_type}`)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/properties/${id}/edit`}
            className="inline-flex items-center gap-2 h-10 px-4 bg-surface-elevated border border-border text-text-primary text-sm font-medium rounded-xl hover:border-accent/30 hover:text-accent transition-all duration-200"
          >
            <Pencil className="h-4 w-4" />
            {t("editProperty")}
          </Link>
          <Link
            href={`/${locale}/properties/${id}/units/new`}
            className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            {tu("addUnit")}
          </Link>
        </div>
      </div>

      {/* Property Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
              className="bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                  {stat.label}
                </span>
                <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${stat.color}`} />
                </div>
              </div>
              <p className="text-xl font-bold text-text-primary font-mono tabular-nums">
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
        <div className="bg-gradient-to-r from-accent/5 via-accent/8 to-success/5 border border-accent/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-0.5">
              {tc("monthlyRevenue")}
            </p>
            <p className="text-xl font-bold font-mono tabular-nums text-text-primary">
              {monthlyRevenue.toLocaleString("en-OM", {
                minimumFractionDigits: 2,
              })}
              <span className="text-xs font-sans font-normal text-text-secondary ml-1.5">
                {CURRENCY.code}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Units Grid */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4 font-display tracking-tight">
          {tu("title")}
          {allUnits.length > 0 && (
            <span className="ml-2 text-sm font-normal text-text-secondary">
              ({allUnits.length})
            </span>
          )}
        </h2>

        {allUnits.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {allUnits.map((unit: Record<string, unknown>) => {
              const status = (unit.status as string) || "vacant";
              const config = statusConfig[status] || statusConfig.vacant;
              const leases = (unit.leases as Record<string, unknown>[]) || [];
              const activeLease = leases.find(
                (l) => l.is_active === true
              );
              const tenant = activeLease?.tenants as Record<string, unknown> | null;

              return (
                <Link
                  key={unit.id as string}
                  href={`/${locale}/properties/${id}/units/${unit.id}`}
                  className={`${config.bg} border ${config.border} rounded-xl p-4 transition-all duration-200 group hover:shadow-md hover:shadow-black/5`}
                >
                  {/* Unit number */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-text-primary group-hover:text-accent font-mono transition-colors">
                      {unit.unit_number as string}
                    </p>
                    <div className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
                  </div>

                  {/* Status badge */}
                  <span
                    className={`inline-block text-[10px] font-semibold uppercase tracking-wider ${config.text}`}
                  >
                    {String(tu(status))}
                  </span>

                  {/* Tenant name or type */}
                  {tenant ? (
                    <p className="text-[11px] text-text-secondary mt-1.5 truncate">
                      {tenant.full_name as string}
                    </p>
                  ) : (unit.unit_type as string) ? (
                    <p className="text-[11px] text-text-secondary/60 mt-1.5 capitalize">
                      {unit.unit_type as string}
                    </p>
                  ) : null}

                  {/* Rent */}
                  {unit.rent_amount ? (
                    <p className="text-xs font-bold font-mono tabular-nums text-text-primary/70 mt-2">
                      {Number(unit.rent_amount).toLocaleString("en-OM", {
                        minimumFractionDigits: 0,
                      })}{" "}
                      <span className="text-[10px] font-normal text-text-secondary">
                        {CURRENCY.code}
                      </span>
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between mt-2">
                    <Link
                      href={`/${locale}/properties/${id}/units/${unit.id}/edit`}
                      className="text-[10px] text-text-secondary/0 group-hover:text-accent transition-all duration-200 hover:underline"
                    >
                      {tu("editUnit")}
                    </Link>
                    <ChevronRight className="h-3 w-3 text-text-secondary/0 group-hover:text-text-secondary/60 transition-all duration-200" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl p-16 text-center">
            <div className="p-4 bg-accent/10 rounded-2xl w-fit mx-auto mb-4">
              <Home className="h-10 w-10 text-accent/60" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2 font-display">
              {tu("noUnits")}
            </h3>
            <p className="text-sm text-text-secondary mb-6 max-w-sm mx-auto">
              {tu("noUnitsDescription")}
            </p>
            <Link
              href={`/${locale}/properties/${id}/units/new`}
              className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20"
            >
              <Plus className="h-4 w-4" />
              {tu("addUnit")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
