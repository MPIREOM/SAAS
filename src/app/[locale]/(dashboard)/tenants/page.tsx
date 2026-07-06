import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Plus, Phone } from "lucide-react";
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

  // Property-level access control — a single joined query replaces the old
  // units -> leases two-step lookup (one round-trip instead of two)
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  let accessibleTenantIds: string[] | null = null;
  if (propertyIds !== null) {
    const { data: leases } = await supabase
      .from("leases")
      .select("tenant_id, units!inner(property_id)")
      .in("units.property_id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
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
  // Count and page load in parallel
  const [{ count: totalCount }, { data: tenants }] = await Promise.all([
    countQuery,
    query.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
  ]);
  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <TenantsHeader locale={locale} />
      </PageHeader>

      <TenantsFilter />

      {tenants && tenants.length > 0 ? (
        <div className="bg-surface border border-border rounded-xl animate-fade-in overflow-hidden">
          {/* Desktop table — hidden on mobile in favor of the card list below */}
          <div className="hidden overflow-x-auto md:block">
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
                      <Badge
                        variant={
                          (tenant.status as string) === "archived"
                            ? "secondary"
                            : "success"
                        }
                      >
                        {t(tenant.status as string)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Mobile card list */}
          <ul className="md:hidden divide-y divide-border/30">
            {tenants.map((tenant: Record<string, unknown>) => {
              const leases = Array.isArray(tenant.leases)
                ? (tenant.leases as Record<string, unknown>[])
                : [];
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
              const isArchived = (tenant.status as string) === "archived";

              return (
                <li key={`m-${tenant.id as string}`} className="p-4">
                  <Link
                    href={`/${locale}/tenants/${tenant.id}`}
                    className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate">
                          {tenant.full_name as string}
                        </p>
                        {tenant.phone ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-text-secondary font-mono ltr-nums">
                            <Phone aria-hidden="true" className="h-3 w-3" />
                            {tenant.phone as string}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant={isArchived ? "secondary" : "success"}>
                        {t(tenant.status as string)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="text-text-secondary">
                        {(property?.name as string) || "—"}
                        {unit?.unit_number ? ` · ${unit.unit_number as string}` : ""}
                      </span>
                      {displayLease && (
                        <span className="ms-auto font-mono tabular-nums text-text-primary">
                          {displayLease.monthly_rent as string} {CURRENCY.code}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

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
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={t("noTenants")}
          description={t("noTenantsDescription")}
          action={
            <Link
              href={`/${locale}/tenants/new`}
              className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t("createTenant")}
            </Link>
          }
        />
      )}
    </div>
  );
}
