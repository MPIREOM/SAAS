import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createVisitsAdminClient,
  getCampaignByToken,
  getPropertyUnits,
  getTakenSlots,
  isUniqueViolation,
  isVerificationLocked,
  isVisitOver,
  newVisitToken,
  phoneLast4,
  recordVerificationFailure,
  slotOptions,
  uniqueViolationKind,
} from "@/lib/visits/service";
import { generateSlots, isBeforeCutoff, slotKey } from "@/lib/visits/slots";
import { sendVisitConfirmation } from "@/lib/visits/whatsapp";

// Public: the shared per-visit booking link. GET shows the visit, the
// occupied units and the free slots; POST books a slot after checking the
// last 4 digits of the phone number on the unit's active lease.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createVisitsAdminClient();
  const campaign = await getCampaignByToken(db, token);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const info = {
    title: campaign.title,
    notes: campaign.notes,
    property_name: campaign.property_name,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    slot_minutes: campaign.slot_minutes,
  };
  if (campaign.status !== "open" || isVisitOver(campaign)) {
    return NextResponse.json({ error: "closed", campaign: info }, { status: 410 });
  }

  const [units, taken] = await Promise.all([
    getPropertyUnits(db, campaign.property_id),
    getTakenSlots(db, campaign.id),
  ]);

  return NextResponse.json({
    campaign: info,
    // Unit numbers only: never reveal tenants or which units have booked.
    units: units.filter((u) => u.tenant).map((u) => u.unit_number),
    slots: slotOptions(campaign, taken),
  });
}

const bookSchema = z.object({
  unit_number: z.string().trim().min(1).max(50),
  phone_last4: z.string().regex(/^\d{4}$/),
  slot_start: z.string().min(1).max(40),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = bookSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const input = parsed.data;

  const db = createVisitsAdminClient();
  const campaign = await getCampaignByToken(db, token);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (campaign.status !== "open" || isVisitOver(campaign)) {
    return NextResponse.json({ error: "closed" }, { status: 410 });
  }

  const units = await getPropertyUnits(db, campaign.property_id);
  const unit = units.find((u) => u.unit_number.toLowerCase() === input.unit_number.toLowerCase());
  if (!unit || !unit.tenant) return NextResponse.json({ error: "unit_not_found" }, { status: 404 });

  if (await isVerificationLocked(db, campaign.id, unit.unit_id)) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }
  const expected = phoneLast4(unit.tenant.phone);
  if (!expected || expected !== input.phone_last4) {
    await recordVerificationFailure(db, campaign.id, unit.unit_id);
    return NextResponse.json({ error: "phone_mismatch" }, { status: 403 });
  }

  // Verified. If this unit already booked, hand back its manage link so a
  // tenant who lost the WhatsApp message can still reschedule or cancel.
  const { data: existing } = await db
    .from("visit_bookings")
    .select("manage_token")
    .eq("campaign_id", campaign.id)
    .eq("unit_id", unit.unit_id)
    .eq("status", "booked")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "already_booked", manage_token: existing.manage_token }, { status: 409 });
  }

  let slotStart: string;
  try {
    slotStart = slotKey(input.slot_start);
  } catch {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }
  if (!generateSlots(campaign).includes(slotStart) || !isBeforeCutoff(slotStart)) {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }

  const manageToken = newVisitToken();
  const { data: inserted, error: insertError } = await db
    .from("visit_bookings")
    .insert({
      campaign_id: campaign.id,
      unit_id: unit.unit_id,
      tenant_id: unit.tenant.id,
      slot_start: slotStart,
      manage_token: manageToken,
      booked_by: "tenant",
    })
    .select("id")
    .single();
  if (insertError) {
    if (isUniqueViolation(insertError)) {
      const kind = uniqueViolationKind(insertError);
      return NextResponse.json({ error: kind === "unit" ? "already_booked" : "slot_taken" }, { status: 409 });
    }
    console.error("[visit-booking] insert failed", insertError);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  try {
    await sendVisitConfirmation(unit.tenant, {
      title: campaign.title,
      notes: campaign.notes,
      propertyName: campaign.property_name,
      unitNumber: unit.unit_number,
      origin: request.nextUrl.origin,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      slot_minutes: campaign.slot_minutes,
      slotStart,
      manageToken,
      log: { campaignId: campaign.id, unitId: unit.unit_id, tenantId: unit.tenant.id, bookingId: inserted.id },
    });
  } catch (err) {
    // The booking stands; the tenant also lands on the manage page directly.
    console.error("[visit-booking] confirmation failed", err);
  }

  return NextResponse.json({ manage_token: manageToken });
}
