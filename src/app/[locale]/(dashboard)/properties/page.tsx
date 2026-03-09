import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { Building2, Plus, MapPin } from "lucide-react";

export default async function PropertiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("properties");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select(`
      *,
      units:units(count),
      occupied:units(count)
    `)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {t("title")}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href={`/${locale}/properties/new`}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("createProperty")}
        </Link>
      </div>

      {properties && properties.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property: Record<string, unknown>) => (
            <Link
              key={property.id as string}
              href={`/${locale}/properties/${property.id}`}
              className="bg-surface border border-border rounded-lg p-5 hover:border-accent/30 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-accent/10 rounded-md">
                  <Building2 className="h-5 w-5 text-accent" />
                </div>
              </div>
              <h3 className="text-base font-medium text-text-primary group-hover:text-accent transition-colors">
                {property.name as string}
              </h3>
              {Boolean(property.location) && (
                <div className="flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3 text-text-secondary" />
                  <span className="text-xs text-text-secondary">
                    {property.location as string}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
                <div>
                  <p className="text-xs text-text-secondary">{t("totalUnits")}</p>
                  <p className="text-sm font-medium text-text-primary font-mono ltr-nums">
                    {property.total_units as number || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary">{t("propertyType")}</p>
                  <p className="text-sm font-medium text-text-primary capitalize">
                    {property.property_type as string || "—"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <Building2 className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
          <h3 className="text-base font-medium text-text-primary mb-1">
            {t("noProperties")}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {t("noPropertiesDescription")}
          </p>
          <Link
            href={`/${locale}/properties/new`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("createProperty")}
          </Link>
        </div>
      )}
    </div>
  );
}
