import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { Wrench, Plus } from "lucide-react";

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("maintenance");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("maintenance_requests")
    .select(`
      *,
      units:unit_id(unit_number, properties:property_id(name)),
      tenants:tenant_id(full_name)
    `)
    .order("created_at", { ascending: false });

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

  const tabs = ["all", "open", "in_progress", "resolved"] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Maintenance Requests
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Track and manage maintenance requests across properties
          </p>
        </div>
        <Link
          href={`/${locale}/maintenance/new`}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Request
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <span
            key={tab}
            className="px-3 py-1.5 text-sm rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer capitalize"
          >
            {tab === "in_progress" ? "In Progress" : tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </span>
        ))}
      </div>

      {requests && requests.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  ID
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  Unit
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  Property
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  Category
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  Description
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  Urgency
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((request: Record<string, unknown>) => {
                const unit = request.units as Record<string, unknown> | null;
                const property = unit?.properties as Record<string, unknown> | null;
                const tenant = request.tenants as Record<string, unknown> | null;

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
                      <span className="text-sm text-text-secondary capitalize">
                        {(request.category as string) || "—"}
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
                        {request.urgency as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          statusColors[(request.status as string) || "open"]
                        }`}
                      >
                        {(request.status as string)?.replace("_", " ")}
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
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <Wrench className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
          <h3 className="text-base font-medium text-text-primary mb-1">
            No maintenance requests
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            Create your first maintenance request to start tracking
          </p>
          <Link
            href={`/${locale}/maintenance/new`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Request
          </Link>
        </div>
      )}
    </div>
  );
}
