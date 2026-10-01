import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCampaignById, getPropertyUnits, isVisitOver } from "@/lib/visits/service";
import { sendVisitInvite } from "@/lib/visits/whatsapp";

// Staff: WhatsApp the shared booking link to tenants who haven't booked yet
// (all of them, or just the units passed in unit_ids). Reads go through the
// user's RLS client, so only their own properties can be messaged.

export const maxDuration = 300;

const schema = z.object({ unit_ids: z.array(z.string().uuid()).max(500).optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const campaign = await getCampaignById(supabase, id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (campaign.status !== "open" || isVisitOver(campaign)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const [units, { data: bookings }] = await Promise.all([
    getPropertyUnits(supabase, campaign.property_id),
    supabase.from("visit_bookings").select("unit_id").eq("campaign_id", id).eq("status", "booked"),
  ]);
  const booked = new Set(((bookings || []) as { unit_id: string }[]).map((b) => b.unit_id));
  const only = parsed.data.unit_ids ? new Set(parsed.data.unit_ids) : null;
  const targets = units.filter((u) => u.tenant && !booked.has(u.unit_id) && (!only || only.has(u.unit_id)));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const unit of targets) {
    const tenant = unit.tenant!;
    if (!tenant.phone || tenant.notifications_enabled === false) {
      skipped++;
      continue;
    }
    try {
      const result = await sendVisitInvite(tenant, {
        title: campaign.title,
        notes: campaign.notes,
        propertyName: campaign.property_name,
        unitNumber: unit.unit_number,
        origin: request.nextUrl.origin,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        slot_minutes: campaign.slot_minutes,
        campaignToken: campaign.token,
      });
      if (result.success) sent++;
      else failed++;
    } catch (err) {
      console.error("[visits] invite failed", { unit: unit.unit_number, err });
      failed++;
    }
  }

  return NextResponse.json({ sent, skipped, failed });
}
