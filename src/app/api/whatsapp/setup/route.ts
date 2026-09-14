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
  return NextResponse.json(status);
}
