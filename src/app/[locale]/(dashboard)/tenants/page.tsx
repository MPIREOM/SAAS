import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { Users, Plus, Phone, Mail } from "lucide-react";
import { TenantsHeader } from "@/components/tenants/tenants-header";
import { TenantsFilter } from "@/components/tenants/tenants-filter";

export default async function TenantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const t = await getTranslations("tenants");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  // Property-level access control
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  let accessibleTenantIds: string[] | null = null;
  if (propertyIds !== null) {
    const { data: units } = await supabase.from("units").select("id").in("property_id", propertyIds);
    const accessUnitIds = units?.map(u => u.id) || [];
    const { data: leases } = await supabase.from("leases").select("tenant_id").in("unit_id", accessUnitIds.length > 0 ? accessUnitIds : ["__no_access__"]);
    accessibleTenantIds = [...new Set(leases?.map(l => l.tenant_id) || [])];
  }

  const status =
    typeof resolvedSearchParams.status === "string"
      ? resolvedSearchParams.status
      : "active";
  const search =
    typeof resolvedSearchParams.search === "string"
      ? resolvedSearchParams.search.trim()
      : "";
  const page =
    typeof resolvedSearchParams.page === "string"
      ? resolvedSearchParams.page
      : "1";

  let query = supabase
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
    .order("created_at", { ascending: false });

  // Filter by status (default: active)
  if (status !== "all") {
    query = query.eq("status", status);
  }

  // Search by name, phone, or national_id
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,phone.ilike.%${search}%,national_id.ilike.%${search}%`
    );
  }

  if (accessibleTenantIds !== null) {
    query = query.in("id", accessibleTenantIds.length > 0 ? accessibleTenantIds : ["__no_access__"]);
  }

  // Pagination
  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, parseInt(page || "1", 10));

  // Get total count for pagination
  let countQuery = supabase
    .from("tenants")
    .select("*", { count: "exact", head: true });

  if (status !== "all") {
    countQuery = countQuery.eq("status", status);
  }
  if (search) {
    countQuery = countQuery.or(
      `full_name.ilike.%${search}%,phone.ilike.%${search}%,national_id.ilike.%${search}%`
    );
  }
  if (accessibleTenantIds !== null) {
    countQuery = countQuery.in("id", accessibleTenantIds.length > 0 ? accessibleTenantIds : ["__no_access__"]);
  }
  const { count: totalCount } = await countQuery;
  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

  const { data: tenants } = await query
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

  const statusColors: Record<string, string> = {
    active: "bg-success/10 text-success",
    archived: "bg-text-secondary/10 text-text-secondary",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-display">
            {t("title")}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t("subtitle")}
          </p>
        </div>
        <TenantsHeader locale={locale} />
      </div>

      <TenantsFilter />

      {tenants && tenants.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto animate-fade-in">
          <table className="w-full min-w-[600px] mobile-card-view">
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
                const leases = Array.isArray(tenant.leases)
                  ? (tenant.leases as Record<string, unknown>[])
                  : [];

                // For active tenants, show active lease; for archived, show most recent lease
                const activeLease = leases.find((l) => l.is_active);
                const lastLease =
                  leases.length > 0
                    ? leases.sort(
                        (a, b) =>
                          new Date(b.end_date as string).getTime() -
                          new Date(a.end_date as string).getTime()
                      )[0]
                    : null;

                const displayLease =
                  tenant.status === "archived" ? lastLease : activeLease;

                const unit = displayLease
                  ? (displayLease.units as Record<string, unknown>)
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
                        {displayLease
                          ? `${displayLease.monthly_rent} ${CURRENCY.code}`
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

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl={`/${locale}/tenants`}
            searchParams={{
              ...(status ? { status } : {}),
              ...(search ? { search } : {}),
            }}
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-16 text-center">
          <div className="p-3 bg-accent/10 rounded-2xl w-fit mx-auto mb-3">
            <Users className="h-8 w-8 text-accent/50" />
          </div>
          <h3 className="text-base font-medium text-text-primary mb-1 font-display">
            {t("noTenants")}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {t("noTenantsDescription")}
          </p>
          <Link
            href={`/${locale}/tenants/new`}
            className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            {t("createTenant")}
          </Link>
        </div>
      )}
    </div>
  );
}
