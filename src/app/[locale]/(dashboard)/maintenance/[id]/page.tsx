import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Wrench,
  ArrowLeft,
  User,
  Phone,
  Calendar,
  DollarSign,
  MessageSquare,
} from "lucide-react";
import MaintenanceActions from "./maintenance-actions";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("maintenance");
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("maintenance_requests")
    .select(`
      *,
      units:unit_id(unit_number, properties:property_id(name)),
      tenants:tenant_id(full_name, phone)
    `)
    .eq("id", id)
    .single();

  if (!request) {
    notFound();
  }

  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null) {
    const unitData = request.units as Record<string, unknown> | null;
    const propertyData = unitData?.properties as Record<string, unknown> | null;
    // The query joins units -> properties, but we need property_id from the unit.
    // Since property is joined via property_id, we can get it from request.unit_id's property.
    // Actually the unit is joined as units:unit_id(unit_number, properties:property_id(name))
    // We need the property_id. Let's fetch it from the unit directly.
    if (request.unit_id) {
      const { data: unitForAccess } = await supabase
        .from("units")
        .select("property_id")
        .eq("id", request.unit_id as string)
        .single();
      if (unitForAccess && !propertyIds.includes(unitForAccess.property_id)) {
        notFound();
      }
    }
  }

  const { data: notes } = await supabase
    .from("maintenance_notes")
    .select("*")
    .eq("maintenance_request_id", id)
    .order("created_at", { ascending: true });

  const unit = request.units as Record<string, unknown> | null;
  const property = unit?.properties as Record<string, unknown> | null;
  const tenant = request.tenants as Record<string, unknown> | null;

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

  const statusFlow = ["open", "in_progress", "resolved", "closed"];
  const currentIndex = statusFlow.indexOf(request.status as string);
  const nextStatus = currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${locale}/maintenance`}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold text-text-primary font-display">
              Request #{(request.id as string).slice(0, 8)}
            </h1>
          </div>
          <p className="text-sm text-text-secondary">
            {(property?.name as string) || "—"} &middot; Unit {(unit?.unit_number as string) || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-full capitalize ${
              urgencyColors[(request.urgency as string) || "low"]
            }`}
          >
            {request.urgency as string}
          </span>
          <span
            className={`text-xs px-2.5 py-1 rounded-full capitalize ${
              statusColors[(request.status as string) || "open"]
            }`}
          >
            {(request.status as string)?.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t("details")}
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-text-secondary" />
              <span className="text-sm text-text-primary capitalize">
                {request.category as string}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-text-secondary" />
              <span className="text-sm text-text-secondary font-mono ltr-nums">
                {new Date(request.created_at as string).toLocaleDateString()}
              </span>
            </div>
            {Boolean(request.estimated_cost) && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-sm text-text-primary font-mono ltr-nums">
                  {request.estimated_cost as number} {CURRENCY.code}
                </span>
              </div>
            )}
            {Boolean(request.actual_cost) && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-accent" />
                <span className="text-sm text-accent font-mono ltr-nums">
                  {request.actual_cost as number} {CURRENCY.code} (Actual)
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t("tenant")}
          </h3>
          {tenant ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-sm text-text-primary">
                  {tenant.full_name as string}
                </span>
              </div>
              {(tenant.phone as string) && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-text-secondary" />
                  <span className="text-sm text-text-secondary font-mono ltr-nums">
                    {tenant.phone as string}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">No tenant assigned</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t("assignedTo")}
          </h3>
          {request.assigned_to_name ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-sm text-text-primary">
                  {request.assigned_to_name as string}
                </span>
              </div>
              {Boolean(request.assigned_to_phone) && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-text-secondary" />
                  <span className="text-sm text-text-secondary font-mono ltr-nums">
                    {request.assigned_to_phone as string}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">{t("notAssigned")}</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          {t("description")}
        </h3>
        <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {request.description as string}
        </p>
      </div>

      {/* Status Flow */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-text-primary mb-4">
          {t("statusUpdate")}
        </h3>
        <div className="flex items-center gap-3 mb-4">
          {statusFlow.map((status, index) => (
            <div key={status} className="flex items-center gap-3">
              <div
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize ${
                  index <= currentIndex
                    ? statusColors[status]
                    : "bg-surface-elevated text-text-secondary"
                }`}
              >
                {status.replace("_", " ")}
              </div>
              {index < statusFlow.length - 1 && (
                <div
                  className={`w-6 h-px ${
                    index < currentIndex ? "bg-accent" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <MaintenanceActions
          requestId={id}
          currentStatus={request.status as string}
          nextStatus={nextStatus}
        />
      </div>

      {/* Notes / Activity Log */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-text-primary mb-4">
          <MessageSquare className="h-4 w-4 inline-block mr-2 text-text-secondary" />
          {t("activityLog")}
        </h3>

        {notes && notes.length > 0 ? (
          <div className="space-y-3 mb-6">
            {notes.map((note: Record<string, unknown>) => (
              <div
                key={note.id as string}
                className="border-l-2 border-border pl-4 py-2"
              >
                <p className="text-sm text-text-primary">
                  {note.content as string}
                </p>
                <p className="text-xs text-text-secondary mt-1 font-mono ltr-nums">
                  {new Date(note.created_at as string).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary mb-6">
            {t("noNotes")}
          </p>
        )}

        <MaintenanceActions
          requestId={id}
          currentStatus={request.status as string}
          nextStatus={nextStatus}
          showNoteForm
        />
      </div>
    </div>
  );
}
