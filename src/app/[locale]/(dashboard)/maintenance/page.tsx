import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { Wrench, Plus } from "lucide-react";

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

  // Property-level access control
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  let unitIds: string[] | null = null;
  if (propertyIds !== null) {
    const { data: units } = await supabase.from("units").select("id").in("property_id", propertyIds);
    unitIds = units?.map(u => u.id) || [];
  }

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
      units:unit_id(unit_number, properties:property_id(name)),
      tenants:tenant_id(full_name)
    `)
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  if (unitIds !== null) {
    query = query.in("unit_id", unitIds.length > 0 ? unitIds : ["__no_access__"]);
  }

  // Pagination
  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, parseInt(page || "1", 10));

  // Get total count for pagination
  let countQuery = supabase
    .from("maintenance_requests")
    .select("*", { count: "exact", head: true });

  if (statusFilter !== "all") {
    countQuery = countQuery.eq("status", statusFilter);
  }
  if (unitIds !== null) {
    countQuery = countQuery.in("unit_id", unitIds.length > 0 ? unitIds : ["__no_access__"]);
  }
  const { count: totalCount } = await countQuery;
  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

  const { data: requests } = await query
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

  const urgencyColors: Record<string, string> = {
    low: "bg-text-secondary/10 text-text-secondary",
    medium: "bg-accent/10 text-accent",
    high: "bg-warning/10 text-warning",
    emergency: "bg-destructive/10 text-destructive",
  };

  const statusColors: Record<string, string> = {
    open: "bg-warning/10 text-warning",
    in_progress: "bg-accent/10 text-accent",
    resolved: "bg-success/10 text-success",
    closed: "bg-text-secondary/10 text-text-secondary",
  };

  const tabs = ["all", "open", "in_progress", "resolved", "closed"] as const;

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
        <Link
          href={`/${locale}/maintenance/new`}
          className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          {t("newRequest")}
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 w-fit overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/${locale}/maintenance${tab === "all" ? "" : `?status=${tab}`}`}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === tab
                ? "bg-accent text-background font-medium"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
            }`}
          >
            {t(`tabs.${tab}`)}
          </Link>
        ))}
      </div>

      {requests && requests.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto animate-fade-in">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("table.id")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("table.unit")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("table.property")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("category")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("description")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("urgency")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("status")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("table.created")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((request: Record<string, unknown>) => {
                const unit = request.units as Record<string, unknown> | null;
                const property = unit?.properties as Record<string, unknown> | null;

                return (
                  <tr
                    key={request.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/maintenance/${request.id}`}
                        className="text-sm font-medium text-text-primary hover:text-accent transition-colors font-mono"
                      >
                        {(request.id as string).slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono">
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
                        {(request.description as string)?.length > 50 ? "..." : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          urgencyColors[(request.urgency as string) || "low"]
                        }`}
                      >
                        {t(`urgencies.${request.urgency}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          statusColors[(request.status as string) || "open"]
                        }`}
                      >
                        {t(`statuses.${request.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary font-mono ltr-nums">
                        {new Date(request.created_at as string).toLocaleDateString()}
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
            baseUrl={`/${locale}/maintenance`}
            searchParams={{
              ...(statusFilter && statusFilter !== "all" ? { status: statusFilter } : {}),
            }}
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-16 text-center">
          <div className="p-3 bg-accent/10 rounded-2xl w-fit mx-auto mb-3">
            <Wrench className="h-8 w-8 text-accent/50" />
          </div>
          <h3 className="text-base font-medium text-text-primary mb-1 font-display">
            {t("noRequests")}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {t("noRequestsDescription")}
          </p>
          <Link
            href={`/${locale}/maintenance/new`}
            className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            {t("newRequest")}
          </Link>
        </div>
      )}
    </div>
  );
}
