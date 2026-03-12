import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Building2,
  Plus,
  Home,
  ArrowLeft,
  Edit,
  Users,
} from "lucide-react";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("properties");
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

  const { data: units } = await supabase
    .from("units")
    .select("*, leases(tenant_id, tenants(full_name))")
    .eq("property_id", id)
    .order("unit_number");

  const statusColors: Record<string, string> = {
    vacant: "bg-success/10 text-success",
    occupied: "bg-destructive/10 text-destructive",
    maintenance: "bg-warning/10 text-warning",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${locale}/properties`}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold text-text-primary">
              {property.name}
            </h1>
          </div>
          <p className="text-sm text-text-secondary">
            {property.location || t("noLocation")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/properties/${id}/units/new`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            {tu("addUnit")}
          </Link>
        </div>
      </div>

      {/* Property Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          {
            label: t("totalUnits"),
            value: units?.length || 0,
            icon: Home,
          },
          {
            label: tu("occupied"),
            value: units?.filter((u: Record<string, unknown>) => u.status === "occupied").length || 0,
            icon: Users,
          },
          {
            label: tu("vacant"),
            value: units?.filter((u: Record<string, unknown>) => u.status === "vacant").length || 0,
            icon: Home,
          },
          {
            label: t("occupancyRate"),
            value: units?.length
              ? `${Math.round(
                  (units.filter((u: Record<string, unknown>) => u.status === "occupied").length /
                    units.length) *
                    100
                )}%`
              : "0%",
            icon: Building2,
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-surface border border-border rounded-lg p-4"
            >
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {stat.label}
              </span>
              <p className="text-xl font-semibold text-text-primary mt-1 font-mono ltr-nums">
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Units Grid */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-4">
          {tu("title")}
        </h2>
        {units && units.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {units.map((unit: Record<string, unknown>) => (
              <Link
                key={unit.id as string}
                href={`/${locale}/properties/${id}/units/${unit.id}`}
                className="bg-surface border border-border rounded-lg p-3 hover:border-accent/30 transition-colors text-center group"
              >
                <p className="text-sm font-medium text-text-primary group-hover:text-accent font-mono">
                  {unit.unit_number as string}
                </p>
                <span
                  className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${
                    statusColors[(unit.status as string) || "vacant"]
                  }`}
                >
                  {tu(unit.status as string)}
                </span>
                {Boolean(unit.unit_type) && (
                  <p className="text-xs text-text-secondary mt-1 capitalize">
                    {unit.unit_type as string}
                  </p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-12 text-center">
            <Home className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
            <h3 className="text-base font-medium text-text-primary mb-1">
              {tu("noUnits")}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {tu("noUnitsDescription")}
            </p>
            <Link
              href={`/${locale}/properties/${id}/units/new`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
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
