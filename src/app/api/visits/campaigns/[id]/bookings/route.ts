import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getCampaignById,
  getPropertyUnits,
  isUniqueViolation,
  newVisitToken,
  uniqueViolationKind,
} from "@/lib/visits/service";
import { generateSlots, slotKey } from "@/lib/visits/slots";
import { sendVisitConfirmation } from "@/lib/visits/whatsapp";

// Staff: book a slot for a unit on the tenant's behalf (e.g. they called the
// office). No tenant cutoff here; staff may book any free slot of the visit.

const schema = z.object({ unit_id: z.string().uuid(), slot_start: z.string().min(1).max(40) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const campaign = await getCampaignById(supabase, id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const units = await getPropertyUnits(supabase, campaign.property_id);
  const unit = units.find((u) => u.unit_id === parsed.data.unit_id);
  if (!unit) return NextResponse.json({ error: "unit_not_found" }, { status: 404 });

  let slotStart: string;
  try {
    slotStart = slotKey(parsed.data.slot_start);
  } catch {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }
  if (!generateSlots(campaign).includes(slotStart)) {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }

  const manageToken = newVisitToken();
  const { error } = await supabase.from("visit_bookings").insert({
    campaign_id: campaign.id,
    unit_id: unit.unit_id,
    tenant_id: unit.tenant?.id ?? null,
    slot_start: slotStart,
    manage_token: manageToken,
    booked_by: "staff",
  });
  if (error) {
    if (isUniqueViolation(error)) {
      const kind = uniqueViolationKind(error);
      return NextResponse.json({ error: kind === "unit" ? "already_booked" : "slot_taken" }, { status: 409 });
    }
    console.error("[visits] staff booking failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  let notified = false;
  if (unit.tenant) {
    try {
      const result = await sendVisitConfirmation(unit.tenant, {
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
      });
      notified = result.success;
    } catch (err) {
      console.error("[visits] confirmation failed", err);
    }
  }
  return NextResponse.json({ ok: true, notified });
}
