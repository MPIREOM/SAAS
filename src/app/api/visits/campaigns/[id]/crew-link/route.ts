import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { newVisitToken } from "@/lib/visits/service";

// Staff: the read-only contractor schedule link for a visit (048).
// POST creates it (or returns the existing one; regenerate: true replaces
// it, which stops the old link working). DELETE turns it off. RLS scopes
// both to the user's properties.

const postSchema = z.object({ regenerate: z.boolean().optional() });

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { data: campaign } = await supabase.from("visit_campaigns").select("id, crew_token").eq("id", id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (campaign.crew_token && !parsed.data.regenerate) {
    return NextResponse.json({ crew_token: campaign.crew_token });
  }

  const crewToken = newVisitToken();
  const { error } = await supabase
    .from("visit_campaigns")
    .update({ crew_token: crewToken, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[visits] crew link failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ crew_token: crewToken });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("visit_campaigns")
    .update({ crew_token: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
