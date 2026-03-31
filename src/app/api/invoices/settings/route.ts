import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("invoice_settings")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { auto_generate_enabled, days_before_due } = body as {
    auto_generate_enabled: boolean;
    days_before_due: number;
  };

  if (typeof auto_generate_enabled !== "boolean" || typeof days_before_due !== "number") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (days_before_due < 0 || days_before_due > 30 || !Number.isInteger(days_before_due)) {
    return NextResponse.json(
      { error: "days_before_due must be an integer between 0 and 30" },
      { status: 400 }
    );
  }

  // Get the existing settings row ID first
  const { data: existing } = await supabase
    .from("invoice_settings")
    .select("id")
    .limit(1)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Invoice settings not found. Please run migration 015." }, { status: 404 });
  }

  // Update the single settings row
  const { data, error } = await supabase
    .from("invoice_settings")
    .update({
      auto_generate_enabled,
      days_before_due,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
