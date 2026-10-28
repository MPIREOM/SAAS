import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Wrench, Plus, AlertTriangle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

type UrgencyTone = "low" | "medium" | "high" | "emergency";
type StatusTone = "open" | "in_progress" | "resolved" | "closed";

function urgencyVariant(u: string): "secondary" | "default" | "warning" | "destructive" {
  switch (u as UrgencyTone) {
    case "emergency":
      return "destructive";
    case "high":
      return "warning";
    case "medium":
      return "default";
    default:
      return "secondary";
  }
}

function statusVariant(s: string): "warning" | "default" | "success" | "secondary" {
  switch (s as StatusTone) {
    case "open":
      return "warning";
    case "in_progress":
      return "default";
    case "resolved":
      return "success";
    default:
      return "secondary";
  }
}

export default async function MaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const t = await getTranslations("maintenance");
  const supabase = await createClient();

  // Property-level access control — restricted users filter through the
  // joined unit's property_id, so no unit-ID prefetch round-trip is needed
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  const accessFilter =
    propertyIds !== null
      ? propertyIds.length > 0
        ? propertyIds
        : ["__no_access__"]
      : null;

  const statusFilter =
    typeof resolvedSearchParams.status === "string"
      ? resolvedSearchParams.status
      : "all";
  const page =
    typeof resolvedSearchParams.page === "string"
      ? resolvedSearchParams.page
      : "1";

  let query = supabase
    .from("maintenance_requests")
    .select(`
      *,
      units:unit_id${accessFilter !== null ? "!inner" : ""}(unit_number, property_id, properties:property_id(name)),
      tenants:tenant_id(full_name)
    `)
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  if (accessFilter !== null) {
    query = query.in("units.property_id", accessFilter);
  }

  // Pagination
  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, parseInt(page || "1", 10));

  // Get total count for pagination
  let countQuery = supabase
    .from("maintenance_requests")
    .select(
      accessFilter !== null ? "*, units:unit_id!inner(property_id)" : "*",
      { count: "exact", head: true }
    );

  if (statusFilter !== "all") {
    countQuery = countQuery.eq("status", statusFilter);
  }
  if (accessFilter !== null) {
    countQuery = countQuery.in("units.property_id", accessFilter);
  }

  // Count and page load in parallel
  const [{ count: totalCount }, { data: requestRows }] = await Promise.all([
    countQuery,
    query.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
  ]);
  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);
  // Cast: the conditional select string defeats the client's literal-type
  // parser; rows are consumed as Record<string, unknown> below anyway.
  const requests = requestRows as unknown as Record<string, unknown>[] | null;

  const tabs = ["all", "open", "in_progress", "resolved", "closed"] as const;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Link
          href={`/${locale}/maintenance/new`}
          className={buttonVariants()}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("newRequest")}
        </Link>
      </PageHeader>

      {/* Filter Tabs */}
      <div className="inline-flex max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-[9px] border border-border bg-sunken p-[3px]">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/${locale}/maintenance${tab === "all" ? "" : `?status=${tab}`}`}
            aria-current={statusFilter === tab ? "page" : undefined}
            className={`shrink-0 inline-flex h-8 items-center px-3 text-[13px] font-semibold rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              statusFilter === tab
                ? "bg-surface text-text-primary shadow-card ring-1 ring-border"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(`tabs.${tab}`)}
          </Link>
        ))}
      </div>

      {requests && requests.length > 0 ? (
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden animate-fade-in">
          {/* Desktop table — hidden on mobile in favor of card list */}
          <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal px-4 py-3">
                  {t("table.id")}
                </th>
                <th className="text-start text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal px-4 py-3">
                  {t("table.unit")}
                </th>
                <th className="text-start text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal px-4 py-3">
                  {t("table.property")}
                </th>
                <th className="text-start text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal px-4 py-3">
                  {t("category")}
                </th>
                <th className="text-start text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal px-4 py-3">
                  {t("description")}
                </th>
                <th className="text-start text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal px-4 py-3">
                  {t("urgency")}
                </th>
                <th className="text-start text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal px-4 py-3">
                  {t("status")}
                </th>
                <th className="text-start text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal px-4 py-3">
                  {t("table.created")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((request: Record<string, unknown>) => {
                const unit = request.units as Record<string, unknown> | null;
                const property = unit?.properties as Record<string, unknown> | null;
                const urgency = (request.urgency as string) || "low";
                const isUrgent = urgency === "emergency" || urgency === "high";

                return (
                  <tr
                    key={request.id as string}
                    className={`transition-colors ${
                      urgency === "emergency"
                        ? "bg-destructive/[0.04] hover:bg-destructive/[0.08]"
                        : urgency === "high"
                        ? "bg-warning/[0.04] hover:bg-warning/[0.08]"
                        : "hover:bg-surface-elevated"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/maintenance/${request.id}`}
                        className="text-sm font-medium text-text-primary hover:text-accent transition-colors tabular-nums"
                      >
                        {(request.id as string).slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary tabular-nums">
                        {(unit?.unit_number as string) || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {(property?.name as string) || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {request.category ? t(`categories.${request.category}`) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary max-w-[200px] truncate block">
                        {(request.description as string)?.slice(0, 50) || "—"}
                        {(request.description as string)?.length > 50 ? "…" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={urgencyVariant(urgency)} className="gap-1 capitalize">
                        {isUrgent && (
                          <AlertTriangle
                            aria-hidden="true"
                            className="h-3 w-3"
                          />
                        )}
                        {t(`urgencies.${urgency}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={statusVariant(
                          (request.status as string) || "open"
                        )}
                        className="capitalize"
                      >
                        {t(`statuses.${request.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary tabular-nums ltr-nums">
                        {new Date(request.created_at as string).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Mobile card list */}
          <ul className="md:hidden divide-y divide-border">
            {requests.map((request: Record<string, unknown>) => {
              const unit = request.units as Record<string, unknown> | null;
              const property = unit?.properties as Record<string, unknown> | null;
              const urgency = (request.urgency as string) || "low";
              const isUrgent = urgency === "emergency" || urgency === "high";

              return (
                <li
                  key={`m-${request.id as string}`}
                  className={`p-4 ${
                    urgency === "emergency"
                      ? "bg-destructive-tint"
                      : urgency === "high"
                      ? "bg-warning-tint"
                      : ""
                  }`}
                >
                  <Link
                    href={`/${locale}/maintenance/${request.id}`}
                    className="block group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                          {(property?.name as string) || "—"}
                          {unit?.unit_number ? ` · ${unit.unit_number as string}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
                          {(request.description as string) || "—"}
                        </p>
                      </div>
                      <Badge variant={urgencyVariant(urgency)} className="gap-1 capitalize shrink-0">
                        {isUrgent && (
                          <AlertTriangle
                            aria-hidden="true"
                            className="h-3 w-3"
                          />
                        )}
                        {t(`urgencies.${urgency}`)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <Badge
                        variant={statusVariant(
                          (request.status as string) || "open"
                        )}
                        className="capitalize"
                      >
                        {t(`statuses.${request.status}`)}
                      </Badge>
                      <span className="text-text-secondary tabular-nums ltr-nums">
                        {new Date(request.created_at as string).toLocaleDateString()}
                      </span>
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
            baseUrl={`/${locale}/maintenance`}
            searchParams={{
              ...(statusFilter && statusFilter !== "all" ? { status: statusFilter } : {}),
            }}
          />
        </div>
      ) : (
        <EmptyState
          icon={<Wrench className="h-5 w-5" />}
          title={t("noRequests")}
          description={t("noRequestsDescription")}
          action={
            <Link
              href={`/${locale}/maintenance/new`}
              className={buttonVariants()}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t("newRequest")}
            </Link>
          }
        />
      )}
    </div>
  );
}
