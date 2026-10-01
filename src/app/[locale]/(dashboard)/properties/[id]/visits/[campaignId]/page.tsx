import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { PageHeader } from "@/components/ui/page-header";
import { getCampaignById, getPropertyUnits, isVisitOver } from "@/lib/visits/service";
import { slotKey, upcomingFreeSlots } from "@/lib/visits/slots";
import { VisitBoard, type BoardUnit } from "@/components/visits/visit-board";

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; campaignId: string }>;
}) {
  const { locale, id, campaignId } = await params;
  const t = await getTranslations("visits");
  const tp = await getTranslations("properties");
  const supabase = await createClient();

  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null && !propertyIds.includes(id)) notFound();
  const campaign = await getCampaignById(supabase, campaignId);
  if (!campaign || campaign.property_id !== id) notFound();

  const [units, { data: bookings }] = await Promise.all([
    getPropertyUnits(supabase, id),
    supabase
      .from("visit_bookings")
      .select("id, unit_id, slot_start, booked_by")
      .eq("campaign_id", campaignId)
      .eq("status", "booked"),
  ]);

  const byUnit = new Map(
    ((bookings || []) as { id: string; unit_id: string; slot_start: string; booked_by: string }[]).map((b) => [
      b.unit_id,
      { id: b.id, slot_start: slotKey(b.slot_start), booked_by: b.booked_by },
    ])
  );
  const boardUnits: BoardUnit[] = units.map((u) => ({
    unit_id: u.unit_id,
    unit_number: u.unit_number,
    tenant_name: u.tenant?.full_name ?? null,
    tenant_phone: u.tenant?.phone ?? null,
    booking: byUnit.get(u.unit_id) ?? null,
  }));

  const taken = new Set(Array.from(byUnit.values()).map((b) => b.slot_start));
  const freeSlots = upcomingFreeSlots(campaign, taken);

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.title}
        breadcrumbs={[
          { label: tp("title"), href: `/${locale}/properties` },
          { label: campaign.property_name, href: `/${locale}/properties/${id}` },
          { label: t("title"), href: `/${locale}/properties/${id}/visits` },
          { label: campaign.title },
        ]}
      />
      <VisitBoard
        locale={locale}
        propertyId={id}
        campaign={{
          id: campaign.id,
          title: campaign.title,
          notes: campaign.notes,
          token: campaign.token,
          status: campaign.status,
          over: isVisitOver(campaign),
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          day_start: campaign.day_start.slice(0, 5),
          day_end: campaign.day_end.slice(0, 5),
          slot_minutes: campaign.slot_minutes,
        }}
        units={boardUnits}
        freeSlots={freeSlots}
      />
    </div>
  );
}
