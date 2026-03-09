import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { Users, Plus, Phone, Mail } from "lucide-react";

export default async function TenantsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("tenants");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const { data: tenants } = await supabase
    .from("tenants")
    .select(`
      *,
      leases(
        id,
        unit_id,
        monthly_rent,
        start_date,
        end_date,
        is_active,
        units(unit_number, property_id, properties(name))
      )
    `)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    active: "bg-success/10 text-success",
    archived: "bg-text-secondary/10 text-text-secondary",
  };

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
          href={`/${locale}/tenants/new`}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("createTenant")}
        </Link>
      </div>

      {tenants && tenants.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("fullName")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("phone")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("property")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("unit")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("monthlyRent")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("status")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((tenant: Record<string, unknown>) => {
                const activeLease = Array.isArray(tenant.leases)
                  ? (tenant.leases as Record<string, unknown>[]).find(
                      (l) => l.is_active
                    )
                  : null;
                const unit = activeLease
                  ? (activeLease.units as Record<string, unknown>)
                  : null;
                const property = unit
                  ? (unit.properties as Record<string, unknown>)
                  : null;

                return (
                  <tr
                    key={tenant.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/tenants/${tenant.id}`}
                        className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
                      >
                        {tenant.full_name as string}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary font-mono ltr-nums">
                        {tenant.phone as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {(property?.name as string) || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono">
                        {(unit?.unit_number as string) || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono ltr-nums">
                        {activeLease
                          ? `${activeLease.monthly_rent} OMR`
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          statusColors[(tenant.status as string) || "active"]
                        }`}
                      >
                        {t(tenant.status as string)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <Users className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
          <h3 className="text-base font-medium text-text-primary mb-1">
            {t("noTenants")}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {t("noTenantsDescription")}
          </p>
          <Link
            href={`/${locale}/tenants/new`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("createTenant")}
          </Link>
        </div>
      )}
    </div>
  );
}
