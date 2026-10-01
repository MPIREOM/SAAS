import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { TenantRecipient } from "@/lib/maintenance/whatsapp";
import {
  createVisitsAdminClient,
  getCampaignById,
  getTakenSlots,
  isUniqueViolation,
  isVisitOver,
  slotOptions,
  uniqueViolationKind,
  type VisitCampaignWithProperty,
} from "@/lib/visits/service";
import { generateSlots, isBeforeCutoff, slotKey } from "@/lib/visits/slots";
import { sendVisitConfirmation } from "@/lib/visits/whatsapp";

// Public: a tenant's private link to one booking (sent on WhatsApp after
// booking). GET shows it, PATCH moves it to another slot (or re-books a
// cancelled one), DELETE cancels it. Changes stop TENANT_CUTOFF_MINUTES
// before the booked slot.

interface BookingRow {
  id: string;
  campaign_id: string;
  unit_id: string;
  slot_start: string;
  status: "booked" | "cancelled";
  manage_token: string;
  units: { unit_number: string } | null;
  tenants: (TenantRecipient & { id: string }) | null;
}

type Db = ReturnType<typeof createVisitsAdminClient>;

async function load(db: Db, manageToken: string) {
  const { data } = await db
    .from("visit_bookings")
    .select(
      "id, campaign_id, unit_id, slot_start, status, manage_token, units(unit_number), tenants(id, full_name, phone, language_preference, notifications_enabled)"
    )
    .eq("manage_token", manageToken)
    .maybeSingle();
  if (!data) return null;
  const booking = data as unknown as BookingRow;
  const campaign = await getCampaignById(db, booking.campaign_id);
  if (!campaign) return null;
  return { booking, campaign };
}

function isOpen(campaign: VisitCampaignWithProperty): boolean {
  return campaign.status === "open" && !isVisitOver(campaign);
}

/** Booked slots can only change before the cutoff; cancelled ones can always be re-booked while the visit is open. */
function canChange(booking: BookingRow, campaign: VisitCampaignWithProperty): boolean {
  if (!isOpen(campaign)) return false;
  return booking.status === "cancelled" || isBeforeCutoff(booking.slot_start);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ manageToken: string }> }) {
  const { manageToken } = await params;
  const db = createVisitsAdminClient();
  const found = await load(db, manageToken);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { booking, campaign } = found;

  const changeable = canChange(booking, campaign);
  const slots = changeable ? slotOptions(campaign, await getTakenSlots(db, campaign.id, booking.id)) : [];

  return NextResponse.json({
    campaign: {
      title: campaign.title,
      notes: campaign.notes,
      property_name: campaign.property_name,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      slot_minutes: campaign.slot_minutes,
      is_open: isOpen(campaign),
    },
    booking: {
      unit_number: booking.units?.unit_number ?? "",
      slot_start: slotKey(booking.slot_start),
      status: booking.status,
      can_change: changeable,
    },
    slots,
  });
}

const moveSchema = z.object({ slot_start: z.string().min(1).max(40) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ manageToken: string }> }) {
  const { manageToken } = await params;
  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = createVisitsAdminClient();
  const found = await load(db, manageToken);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { booking, campaign } = found;
  if (!isOpen(campaign)) return NextResponse.json({ error: "closed" }, { status: 410 });
  if (!canChange(booking, campaign)) return NextResponse.json({ error: "too_late" }, { status: 409 });

  let slotStart: string;
  try {
    slotStart = slotKey(parsed.data.slot_start);
  } catch {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }
  if (!generateSlots(campaign).includes(slotStart) || !isBeforeCutoff(slotStart)) {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }

  const { error } = await db
    .from("visit_bookings")
    .update({
      slot_start: slotStart,
      status: "booked",
      cancelled_at: null,
      reminder_sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id);
  if (error) {
    if (isUniqueViolation(error)) {
      const kind = uniqueViolationKind(error);
      return NextResponse.json({ error: kind === "unit" ? "already_booked" : "slot_taken" }, { status: 409 });
    }
    console.error("[visit-booking] reschedule failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (booking.tenants) {
    try {
      await sendVisitConfirmation(booking.tenants, {
        title: campaign.title,
        notes: campaign.notes,
        propertyName: campaign.property_name,
        unitNumber: booking.units?.unit_number ?? "",
        origin: request.nextUrl.origin,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        slot_minutes: campaign.slot_minutes,
        slotStart,
        manageToken: booking.manage_token,
      });
    } catch (err) {
      console.error("[visit-booking] confirmation failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ manageToken: string }> }) {
  const { manageToken } = await params;
  const db = createVisitsAdminClient();
  const found = await load(db, manageToken);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { booking, campaign } = found;
  if (booking.status === "cancelled") return NextResponse.json({ ok: true });
  if (!canChange(booking, campaign)) return NextResponse.json({ error: "too_late" }, { status: 409 });

  const now = new Date().toISOString();
  const { error } = await db
    .from("visit_bookings")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", booking.id);
  if (error) {
    console.error("[visit-booking] cancel failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
