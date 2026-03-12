import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> }
) {
  try {
    const { unitId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { move_out_date, lease_id } = body;

    if (!move_out_date || !lease_id) {
      return NextResponse.json(
        { error: "move_out_date and lease_id are required" },
        { status: 400 }
      );
    }

    // Deactivate the lease and record the actual move-out date
    const { error: leaseError } = await supabase
      .from("leases")
      .update({ is_active: false, end_date: move_out_date })
      .eq("id", lease_id);

    if (leaseError) {
      return NextResponse.json({ error: leaseError.message }, { status: 500 });
    }

    // Mark unit as vacant
    const { error: unitError } = await supabase
      .from("units")
      .update({ status: "vacant" })
      .eq("id", unitId);

    if (unitError) {
      return NextResponse.json({ error: unitError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
