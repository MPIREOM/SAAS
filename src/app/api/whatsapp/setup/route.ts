import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadWhatsAppSetup } from "@/lib/whatsapp/setup";
import { requireSuperAdmin, requestOrigin } from "./_auth";

// Several Meta round-trips; keep headroom.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const status = await loadWhatsAppSetup(supabase, requestOrigin(request));
  // One line per page load so the state can be read from the server log.
  console.log("[WhatsApp Setup] status", {
    phone: status.phone?.status ?? status.phoneError,
    ownership: status.phone?.codeVerificationStatus ?? null,
    accountReview: status.waba?.accountReviewStatus ?? status.wabaError,
    businessVerification: status.waba?.businessVerificationStatus ?? null,
    appSubscribed: status.appSubscribedToWaba,
    webhookPointsHere: status.webhookPointsHere,
    templates: status.templates.map((t) => `${t.name}:${t.status ?? "missing"}`).join(","),
  });
  return NextResponse.json(status);
}
