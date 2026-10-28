import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY, formatAmount } from "@/lib/currency";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Plus, Phone, Home } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
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

  // Resolve each tenant's display lease once for both layouts: the active
  // lease, or for archived tenants the most recent one.
  const rows = (tenants ?? []).map((tenant: Record<string, unknown>) => {
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
    const displayLease = tenant.status === "archived" ? lastLease : activeLease;
    const unit = displayLease ? (displayLease.units as Record<string, unknown>) : null;
    const property = unit ? (unit.properties as Record<string, unknown>) : null;
    return {
      id: tenant.id as string,
      name: tenant.full_name as string,
      phone: (tenant.phone as string) || "",
      status: tenant.status as string,
      isArchived: (tenant.status as string) === "archived",
      propertyName: (property?.name as string) || "",
      unitNumber: (unit?.unit_number as string) || "",
      rent: displayLease ? formatAmount(displayLease.monthly_rent as string | number) : null,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <TenantsHeader locale={locale} />
      </PageHeader>

      <TenantsFilter />

      {rows.length > 0 ? (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fullName")}</TableHead>
                  <TableHead>{t("phone")}</TableHead>
                  <TableHead>{t("property")}</TableHead>
                  <TableHead>{t("unit")}</TableHead>
                  <TableHead className="text-end">{t("monthlyRent")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/${locale}/tenants/${row.id}`}
                        className="rounded font-semibold text-text-primary hover:text-accent hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-text-secondary">
                      <span dir="ltr" className="tabular-nums">{row.phone}</span>
                    </TableCell>
                    <TableCell className="text-text-secondary">{row.propertyName || "—"}</TableCell>
                    <TableCell className="tabular-nums">{row.unitNumber || "—"}</TableCell>
                    <TableCell className="text-end">
                      {row.rent ? (
                        <span className="font-semibold ltr-nums tabular-nums">
                          {row.rent}
                          <small className="ms-1 text-[0.78em] font-medium text-text-secondary">{CURRENCY.code}</small>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.isArchived ? "secondary" : "success"}>
                        {t(row.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Phone: one card per tenant */}
          <ul className="flex flex-col gap-2 md:hidden" aria-label={t("title")}>
            {rows.map((row) => (
              <li key={`m-${row.id}`}>
                <Link
                  href={`/${locale}/tenants/${row.id}`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-xl border border-border bg-surface p-3.5 shadow-card transition-colors hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="min-w-0 text-[15px] font-semibold text-text-primary [overflow-wrap:anywhere]">
                    {row.name}
                  </span>
                  <span className="text-end font-bold text-text-primary ltr-nums tabular-nums">
                    {row.rent ? (
                      <>
                        {row.rent}
                        <small className="ms-1 text-xs font-medium text-text-tertiary">{CURRENCY.code}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="col-span-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-text-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      <Home aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      {row.propertyName || "—"}
                      {row.unitNumber ? ` · ${row.unitNumber}` : ""}
                    </span>
                    {row.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span dir="ltr" className="tabular-nums">{row.phone}</span>
                      </span>
                    )}
                    <Badge variant={row.isArchived ? "secondary" : "success"} className="ms-auto">
                      {t(row.status)}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
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
        </>
      ) : (
        <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={t("noTenants")}
            description={t("noTenantsDescription")}
            action={
              <Link href={`/${locale}/tenants/new`} className={cn(buttonVariants())}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t("createTenant")}
              </Link>
            }
          />
      )}
    </div>
  );
}
