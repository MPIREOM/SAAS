import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  startOfMonth,
  endOfMonth,
  setDate,
  format,
  isBefore,
  parseISO,
} from 'date-fns';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  // 1. Fetch all active leases
  const { data: activeLeases, error: leasesError } = await supabase
    .from('leases')
    .select('id, tenant_id, unit_id, monthly_rent, payment_due_day')
    .eq('is_active', true);

  if (leasesError) {
    return NextResponse.json({ error: leasesError.message }, { status: 500 });
  }

  // 2. Generate invoices for leases that don't have one this month
  let created = 0;
  let skipped = 0;

  for (const lease of activeLeases ?? []) {
    const periodStartStr = format(monthStart, 'yyyy-MM-dd');

    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('lease_id', lease.id)
      .eq('period_start', periodStartStr)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const dueDay = Math.min(lease.payment_due_day ?? 1, 28);
    const dueDate = setDate(today, dueDay);

    const { error: insertError } = await supabase.from('invoices').insert({
      lease_id: lease.id,
      tenant_id: lease.tenant_id,
      unit_id: lease.unit_id,
      amount: lease.monthly_rent,
      due_date: format(dueDate, 'yyyy-MM-dd'),
      issued_date: format(today, 'yyyy-MM-dd'),
      period_start: periodStartStr,
      period_end: format(monthEnd, 'yyyy-MM-dd'),
      status: 'pending',
    });

    if (!insertError) created++;
  }

  // 3. Mark overdue: pending invoices whose due_date is in the past
  const todayStr = format(today, 'yyyy-MM-dd');
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('id, due_date')
    .eq('status', 'pending');

  let markedOverdue = 0;
  for (const inv of overdueInvoices ?? []) {
    if (isBefore(parseISO(inv.due_date), parseISO(todayStr))) {
      await supabase
        .from('invoices')
        .update({ status: 'overdue' })
        .eq('id', inv.id);
      markedOverdue++;
    }
  }

  return NextResponse.json({
    success: true,
    created,
    skipped,
    marked_overdue: markedOverdue,
  });
}
