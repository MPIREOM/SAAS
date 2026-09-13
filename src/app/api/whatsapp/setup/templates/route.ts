import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMissingTemplates } from "@/lib/whatsapp/setup";
import { requireSuperAdmin } from "../_auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const result = await createMissingTemplates(supabase);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  console.log("[WhatsApp Setup] Templates submitted", {
    created: result.data.results.filter((r) => r.action === "created").length,
    failed: result.data.results.filter((r) => r.action === "failed").length,
  });
  return NextResponse.json(result.data);
}
