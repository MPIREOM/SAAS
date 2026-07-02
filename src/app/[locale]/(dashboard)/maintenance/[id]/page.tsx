import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Wrench,
  User,
  Phone,
  Calendar,
  Banknote,
  MessageSquare,
  Paperclip,
  Video,
} from "lucide-react";
import MaintenanceActions from "./maintenance-actions";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Stepper } from "@/components/ui/stepper";

function urgencyVariant(
  u: string
): "secondary" | "default" | "warning" | "destructive" {
  switch (u) {
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

function statusVariant(
  s: string
): "warning" | "default" | "success" | "secondary" {
  switch (s) {
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

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("maintenance");
  const tc = await getTranslations("common");
  const tu = await getTranslations("units");
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

  const { data: attachments } = await supabase
    .from("maintenance_attachments")
    .select("id, file_url, file_name, file_type, file_size")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const unit = request.units as Record<string, unknown> | null;
  const property = unit?.properties as Record<string, unknown> | null;
  const tenant = request.tenants as Record<string, unknown> | null;

  const statusFlow = ["open", "in_progress", "resolved", "closed"];
  const currentIndex = statusFlow.indexOf(request.status as string);
  const nextStatus = currentIndex < statusFlow.length - 1 ? statusFlow[currentIndex + 1] : null;

  const requestUrgency = (request.urgency as string) || "low";
  const requestStatus = (request.status as string) || "open";

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t("requestNumber", { id: (request.id as string).slice(0, 8) })}
        description={`${(property?.name as string) || "—"} · ${tc("unit")} ${(unit?.unit_number as string) || "—"}`}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/maintenance` },
          { label: `#${(request.id as string).slice(0, 8)}` },
        ]}
      >
        <Badge variant={urgencyVariant(requestUrgency)} className="capitalize">
          {t(`urgencies.${request.urgency}`)}
        </Badge>
        <Badge variant={statusVariant(requestStatus)} className="capitalize">
          {t(`statuses.${request.status}`)}
        </Badge>
      </PageHeader>

      {/* Request overview — identity card */}
      <section className="bg-surface border border-border/60 rounded-xl overflow-hidden animate-fade-in-up">
        <div className="p-5 bg-gradient-to-r from-accent/5 to-transparent border-b border-border/40 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
            <Wrench aria-hidden="true" className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary font-display truncate">
              {t(`categories.${request.category}`)}
            </h2>
            <p className="text-xs text-text-secondary truncate">
              {(property?.name as string) || "—"} &middot; {tc("unit")}{" "}
              <span className="font-mono ltr-nums">
                {(unit?.unit_number as string) || "—"}
              </span>
            </p>
          </div>
        </div>
        <dl className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-5">
          <div>
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Calendar aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("requestDate")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums">
              {new Date(request.created_at as string).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Banknote aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("estimatedCost")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums">
              {request.estimated_cost ? (
                <>
                  {Number(request.estimated_cost).toLocaleString("en-OM", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  <span className="text-[10px] font-sans text-text-secondary">
                    {CURRENCY.code}
                  </span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Banknote aria-hidden="true" className="h-3 w-3 text-accent/70" />
              {t("actualCost")}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-accent font-mono ltr-nums">
              {request.actual_cost ? (
                <>
                  {Number(request.actual_cost).toLocaleString("en-OM", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  <span className="text-[10px] font-sans font-normal text-text-secondary">
                    {CURRENCY.code}
                  </span>
                </>
              ) : (
                <span className="font-normal text-text-primary">—</span>
              )}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <User aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("tenant")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary truncate">
              {tenant ? (tenant.full_name as string) : tu("noTenant")}
            </dd>
            {tenant?.phone ? (
              <dd className="mt-0.5 text-xs text-text-secondary font-mono ltr-nums truncate">
                {tenant.phone as string}
              </dd>
            ) : null}
          </div>
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Phone aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("assignedTo")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary truncate">
              {(request.assigned_to_name as string) || t("notAssigned")}
            </dd>
            {request.assigned_to_phone ? (
              <dd className="mt-0.5 text-xs text-text-secondary font-mono ltr-nums truncate">
                {request.assigned_to_phone as string}
              </dd>
            ) : null}
          </div>
        </dl>
      </section>

      {/* Description */}
      <section className="bg-surface border border-border/60 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary font-display mb-3">
          {t("description")}
        </h3>
        <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {request.description as string}
        </p>
      </section>

      {/* Attachments — always render so it's obvious whether photos were
          received (helps diagnose "I uploaded a photo but it isn't showing"). */}
      <section className="bg-surface border border-border/60 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/15">
            <Paperclip aria-hidden="true" className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary font-display">
            {t("attachments")}
          </h3>
          <span className="text-xs font-medium text-text-secondary bg-surface-elevated border border-border/40 px-2 py-0.5 rounded-md font-mono ltr-nums">
            {attachments?.length || 0}
          </span>
        </div>
        {!attachments || attachments.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t("noAttachments")}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {attachments.map((a) => {
              const url = a.file_url as string;
              const name = (a.file_name as string) || "file";
              const isVideo = a.file_type === "video";
              return (
                <a
                  key={a.id as string}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block bg-surface-elevated border border-border/60 rounded-lg overflow-hidden hover:border-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  title={name}
                >
                  {isVideo ? (
                    <div className="relative aspect-square bg-background flex items-center justify-center">
                      <video
                        src={url}
                        className="w-full h-full object-cover"
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                        <Video aria-hidden="true" className="h-8 w-8 text-white" />
                      </div>
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={url}
                      alt={name}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="px-2 py-1.5 text-[10px] text-text-secondary truncate">
                    {name}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* Status Flow */}
      <section className="bg-surface border border-border/60 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary font-display mb-4">
          {t("statusUpdate")}
        </h3>
        <Stepper
          className="mb-5"
          steps={statusFlow.map((status) => ({
            id: status,
            label: t(`statuses.${status}`),
          }))}
          activeIndex={currentIndex}
        />
        <MaintenanceActions
          requestId={id}
          currentStatus={request.status as string}
          nextStatus={nextStatus}
        />
      </section>

      {/* Notes / Activity Log */}
      <section className="bg-surface border border-border/60 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/15">
            <MessageSquare aria-hidden="true" className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary font-display">
            {t("activityLog")}
          </h3>
          {notes && notes.length > 0 && (
            <span className="text-xs font-medium text-text-secondary bg-surface-elevated border border-border/40 px-2 py-0.5 rounded-md font-mono ltr-nums">
              {notes.length}
            </span>
          )}
        </div>

        {notes && notes.length > 0 ? (
          <ol className="space-y-3 mb-6">
            {notes.map((note: Record<string, unknown>) => (
              <li
                key={note.id as string}
                className="border-s-2 border-accent/30 ps-4 py-1.5"
              >
                <p className="text-sm text-text-primary leading-relaxed">
                  {note.content as string}
                </p>
                <p className="text-xs text-text-secondary mt-1 font-mono ltr-nums">
                  {new Date(note.created_at as string).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
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
      </section>
    </div>
  );
}
