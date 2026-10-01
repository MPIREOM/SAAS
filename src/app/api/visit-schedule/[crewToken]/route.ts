import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { TenantRecipient } from "@/lib/maintenance/whatsapp";
import { createVisitsAdminClient, getCampaignByCrewToken } from "@/lib/visits/service";
import { sendVisitDone } from "@/lib/visits/whatsapp";

// Public (contractor link, 048): record what happened at a booked unit —
// done, or couldn't enter with a reason — plus an optional note (050).
// status null clears it (undo). The first time a unit is marked done the
// tenant gets a WhatsApp message; re-marking never sends a second one.

const schema = z
  .object({
    booking_id: z.string().uuid(),
    status: z.enum(["done", "not_entered"]).nullable(),
    reason: z.enum(["not_home", "refused", "other"]).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.status !== "not_entered" || !!v.reason, { message: "reason required" });

interface BookingRow {
  id: string;
  unit_id: string;
  tenant_id: string | null;
  contact_phone: string | null;
  work_done_notified_at: string | null;
  units: { unit_number: string } | null;
  tenants: (TenantRecipient & { id: string }) | null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ crewToken: string }> }) {
  const { crewToken } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const input = parsed.data;

  const db = createVisitsAdminClient();
  const campaign = await getCampaignByCrewToken(db, crewToken);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data } = await db
    .from("visit_bookings")
    .select(
      "id, unit_id, tenant_id, contact_phone, work_done_notified_at, units(unit_number), tenants(id, full_name, phone, language_preference, notifications_enabled)"
    )
    .eq("id", input.booking_id)
    .eq("campaign_id", campaign.id)
    .eq("status", "booked")
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
  const booking = data as unknown as BookingRow;

  const now = new Date().toISOString();
  const { error } = await db
    .from("visit_bookings")
    .update({
      work_status: input.status,
      work_reason: input.status === "not_entered" ? input.reason : null,
      work_note: input.status ? input.note || null : null,
      work_marked_at: input.status ? now : null,
      updated_at: now,
    })
    .eq("id", booking.id);
  if (error) {
    console.error("[visit-schedule] mark failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  let notified = false;
  if (input.status === "done" && !booking.work_done_notified_at && booking.tenants) {
    // Claim the notification first so two quick taps can't send twice.
    const { data: claimed } = await db
      .from("visit_bookings")
      .update({ work_done_notified_at: now })
      .eq("id", booking.id)
      .is("work_done_notified_at", null)
      .select("id");
    if (claimed?.length) {
      try {
        const result = await sendVisitDone(
          { ...booking.tenants, phone: booking.contact_phone ?? booking.tenants.phone },
          {
            title: campaign.title,
            propertyName: campaign.property_name,
            unitNumber: booking.units?.unit_number ?? "",
            doneAt: now,
            log: { campaignId: campaign.id, unitId: booking.unit_id, tenantId: booking.tenant_id, bookingId: booking.id },
          }
        );
        notified = result.success;
      } catch (err) {
        console.error("[visit-schedule] done message failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true, notified });
}
