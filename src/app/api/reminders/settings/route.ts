import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_OVERDUE_MAX_REPEATS,
  MIN_OVERDUE_REPEAT_DAYS,
} from "@/lib/reminders/overdue-cap";

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
      max_repeats?: number | null;
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

    // Overdue guard rails: a tenant may not be chased more often than every
    // MIN_OVERDUE_REPEAT_DAYS days, and only a bounded number of times per
    // overdue invoice. Repeated notices are what got the number banned.
    const isOverdue = s.reminder_type === "rent_overdue";
    const interval = s.repeat_interval_days;
    if (interval != null && (!Number.isInteger(interval) || interval < 1)) {
      return NextResponse.json(
        { error: `Invalid repeat interval for ${s.reminder_type}` },
        { status: 400 }
      );
    }
    if (isOverdue && interval != null && interval < MIN_OVERDUE_REPEAT_DAYS) {
      return NextResponse.json(
        { error: `Overdue reminders may repeat at most every ${MIN_OVERDUE_REPEAT_DAYS} days` },
        { status: 400 }
      );
    }
    const maxRepeats = isOverdue ? (s.max_repeats ?? null) : null;
    if (
      maxRepeats != null &&
      (!Number.isInteger(maxRepeats) || maxRepeats < 1 || maxRepeats > MAX_OVERDUE_MAX_REPEATS)
    ) {
      return NextResponse.json(
        { error: `Overdue notice limit must be between 1 and ${MAX_OVERDUE_MAX_REPEATS}` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("reminder_settings")
      .update({
        days_before: s.days_before,
        repeat_interval_days: s.repeat_interval_days,
        max_repeats: maxRepeats,
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
