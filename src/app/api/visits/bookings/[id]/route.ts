import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Staff: cancel a booking (frees the slot). RLS (046) scopes it to the
// user's properties.

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("visit_bookings")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", id)
    .eq("status", "booked")
    .select("id");
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
