import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { newVisitToken } from "@/lib/visits/service";
import { validateWindow } from "@/lib/visits/slots";

// Staff: create a building-wide visit for a property. RLS (046) limits this
// to properties the user is assigned to.

const createSchema = z.object({
  property_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(1000).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day_start: z.string().regex(/^\d{2}:\d{2}$/),
  day_end: z.string().regex(/^\d{2}:\d{2}$/),
  slot_minutes: z.number().int().min(5).max(120),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const input = parsed.data;

  const windowError = validateWindow(input);
  if (windowError) return NextResponse.json({ error: windowError }, { status: 400 });

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", input.property_id)
    .maybeSingle();
  if (!property) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("visit_campaigns")
    .insert({
      ...input,
      notes: input.notes || null,
      token: newVisitToken(),
      public_origin: request.nextUrl.origin,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[visits] create failed", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}
