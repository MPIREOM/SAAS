import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@supabase/supabase-js";
import { ImageOff } from "lucide-react";
import { JobMediaList } from "@/components/maintenance/job-media-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PublicVisitMessage, PublicVisitShell } from "@/components/visits/public-shell";
import { requestRef } from "@/lib/maintenance/whatsapp";
import { loadAttachments } from "@/lib/maintenance/workflow";

// Public, read-only page with the photos and video of one maintenance
// request, linked from the technician's WhatsApp job card. Reached by the
// request's full UUID, which only the job card carries; it shows the media
// and where the job is, nothing about the tenant.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MaintenancePhotosPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("maintenancePhotos");
  const invalid = <PublicVisitMessage title={t("invalidLink")} message={t("invalidLinkMessage")} />;
  if (!UUID.test(id)) return invalid;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: request } = await db
    .from("maintenance_requests")
    .select("id, units:unit_id(unit_number, properties:property_id(name))")
    .eq("id", id)
    .maybeSingle();
  if (!request) return invalid;

  const unit = request.units as unknown as { unit_number: string; properties: { name: string } | null } | null;
  const attachments = await loadAttachments(db, id);
  const place = [unit?.properties?.name, unit?.unit_number && t("unit", { number: unit.unit_number })]
    .filter(Boolean)
    .join(" · ");

  return (
    <PublicVisitShell title={t("title", { ref: requestRef(id) })} subtitle={place || undefined}>
      {attachments.length === 0 ? (
        <EmptyState
          icon={<ImageOff aria-hidden="true" className="h-6 w-6" />}
          title={t("empty")}
          description={t("emptyDescription")}
        />
      ) : (
        <JobMediaList attachments={attachments} />
      )}
    </PublicVisitShell>
  );
}
