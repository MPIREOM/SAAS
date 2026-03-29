import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("reminder_settings")
    .select("*")
    .order("reminder_type");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { settings } = body as {
    settings: Array<{
      reminder_type: string;
      days_before: number[];
      repeat_interval_days: number | null;
      is_enabled: boolean;
    }>;
  };

  if (!settings || !Array.isArray(settings)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  for (const s of settings) {
    // Validate days_before are positive integers
    if (!Array.isArray(s.days_before) || s.days_before.some((d) => d < 0 || !Number.isInteger(d))) {
      return NextResponse.json(
        { error: `Invalid days for ${s.reminder_type}` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("reminder_settings")
      .update({
        days_before: s.days_before,
        repeat_interval_days: s.repeat_interval_days,
        is_enabled: s.is_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("reminder_type", s.reminder_type);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
