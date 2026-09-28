import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/access-control";
import { loadRequest } from "@/lib/maintenance/workflow";

const noteSchema = z.object({ note: z.string().trim().min(1).max(4000) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const existing = await loadRequest(supabase, id);
  if (
    !existing ||
    (auth.propertyIds !== null &&
      (!existing.propertyId || !auth.propertyIds.includes(existing.propertyId)))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase.from("maintenance_notes").insert({
    request_id: id,
    note: parsed.data.note,
    created_by_name: auth.fullName || auth.email,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
