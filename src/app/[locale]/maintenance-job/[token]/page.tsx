import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@supabase/supabase-js";
import { JobMediaList } from "@/components/maintenance/job-media-list";
import { JobProgress } from "@/components/maintenance/job-progress";
import { Badge } from "@/components/ui/badge";
import { PublicVisitMessage, PublicVisitShell } from "@/components/visits/public-shell";
import { JOB_PAGE_BN, donePhotoPrefix, jobStage, type JobLabel, type JobPageKey } from "@/lib/maintenance/job-page";
import { categoryLabelBn, isWatchman, requestRef, urgencyLabelBn } from "@/lib/maintenance/whatsapp";
import { loadRequest } from "@/lib/maintenance/workflow";

// Public page for the technician a maintenance job is assigned to, linked
// from the WhatsApp job card. Shows the job and its photos, and lets the
// technician mark the work started and then finished (migration 056). Reached
// by the request's technician_token, which only the job card carries.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function urgencyVariant(urgency: string): "secondary" | "default" | "warning" | "destructive" {
  if (urgency === "emergency") return "destructive";
  if (urgency === "high") return "warning";
  if (urgency === "medium") return "default";
  return "secondary";
}

/** Bengali line (when shown) above the page-language line. */
function Label({ label, className }: { label: JobLabel; className?: string }) {
  return (
    <span className={className}>
      {label.sub && (
        <span lang="bn" className="block">
          {label.sub}
        </span>
      )}
      <span className="block">{label.main}</span>
    </span>
  );
}

export default async function MaintenanceJobPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("maintenanceJob");
  const tm = await getTranslations("maintenance");
  const invalid = <PublicVisitMessage title={t("invalidLink")} message={t("invalidLinkMessage")} />;
  if (!UUID.test(token)) return invalid;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await db
    .from("maintenance_requests")
    .select("id, technician_done_at")
    .eq("technician_token", token)
    .maybeSingle();
  const job = row ? await loadRequest(db, row.id as string) : null;
  if (!row || !job) return invalid;

  const { ctx } = job;
  const bengali = !!job.assignedToPhone && isWatchman(job.assignedToPhone);
  const label = (key: JobPageKey): JobLabel => ({
    main: t(key),
    ...(bengali && { sub: JOB_PAGE_BN[key] }),
  });
  const stage = jobStage(job.status, (row.technician_done_at as string | null) ?? null);
  const category = ctx.category ?? "other";
  const urgency = ctx.urgency.toLowerCase();

  // The technician's own photos of the finished work are for the office.
  const problemMedia = job.attachments.filter((a) => !a.url.includes(`/${donePhotoPrefix(job.id)}`));

  const fact = "text-[12.5px] font-medium text-text-secondary";

  return (
    <PublicVisitShell
      title={t("title", { ref: requestRef(job.id) })}
      subtitle={`${ctx.propertyName} · ${t("unit", { number: ctx.unitNumber })}`}
    >
      <section className="bg-surface border border-border rounded-xl shadow-card p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-text-primary">
          <Label label={label("progress")} />
        </h2>
        <JobProgress
          token={token}
          stage={stage}
          labels={{
            stageNew: label("stageNew"),
            stageWorking: label("stageWorking"),
            stageAwaiting: label("stageAwaiting"),
            stageCompleted: label("stageCompleted"),
            startWork: label("startWork"),
            startHint: label("startHint"),
            markDone: label("markDone"),
            doneHint: label("doneHint"),
            awaitingHint: label("awaitingHint"),
            addPhoto: label("addPhoto"),
            removePhoto: label("removePhoto"),
            saveFailed: label("saveFailed"),
            uploadFailed: label("uploadFailed"),
          }}
        />
      </section>

      <section className="bg-surface border border-border rounded-xl shadow-card p-4">
        <dl className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className={fact}>
                <Label label={label("category")} />
              </dt>
              <dd className="mt-1 text-sm font-semibold text-text-primary">
                <Label
                  label={{
                    main: tm(`categories.${category}`),
                    ...(bengali && { sub: categoryLabelBn(category) }),
                  }}
                />
              </dd>
            </div>
            <div>
              <dt className={fact}>
                <Label label={label("urgency")} />
              </dt>
              <dd className="mt-1.5">
                <Badge variant={urgencyVariant(urgency)}>
                  {bengali ? `${urgencyLabelBn(urgency)} · ` : ""}
                  {tm(`urgencies.${urgency}`)}
                </Badge>
              </dd>
            </div>
          </div>
          <div>
            <dt className={fact}>
              <Label label={label("issue")} />
            </dt>
            <dd dir="auto" className="mt-1 text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
              {ctx.description}
            </dd>
          </div>
          <div>
            <dt className={fact}>
              <Label label={label("tenant")} />
            </dt>
            {ctx.tenantName ? (
              <dd className="mt-1 text-sm text-text-primary">
                <span className="block font-semibold">{ctx.tenantName}</span>
                {ctx.tenantPhone && (
                  <a
                    href={`tel:${ctx.tenantPhone.replace(/[^\d+]/g, "")}`}
                    className="mt-1 inline-flex min-h-12 items-center font-semibold text-accent underline underline-offset-2 tabular-nums ltr-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {ctx.tenantPhone}
                  </a>
                )}
              </dd>
            ) : (
              <dd className="mt-1 text-sm text-text-primary">
                <Label label={label("noTenant")} />
              </dd>
            )}
          </div>
        </dl>
      </section>

      {problemMedia.length > 0 && (
        <>
          <h2 className="px-1 pt-2 text-[15px] font-semibold text-text-primary">
            <Label label={label("media")} />
          </h2>
          <JobMediaList attachments={problemMedia} />
        </>
      )}
    </PublicVisitShell>
  );
}
