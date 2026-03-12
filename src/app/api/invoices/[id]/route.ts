import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { status, payment_method, reference_number, cheque_number, bank_name, cheque_date } = body;

  // Fetch the invoice to get lease/tenant/amount
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, lease_id, tenant_id, amount')
    .eq('id', id)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const today = format(new Date(), 'yyyy-MM-dd');

  // Create a payment record
  if (status === 'paid' && payment_method) {
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        lease_id: invoice.lease_id,
        tenant_id: invoice.tenant_id,
        amount: invoice.amount,
        payment_date: today,
        method: payment_method,
        reference_number: reference_number || null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (paymentError) {
      return NextResponse.json({ error: paymentError.message }, { status: 500 });
    }

    // Create a cheque record if paid by cheque
    if (payment_method === 'cheque' && cheque_number && bank_name && cheque_date) {
      const { error: chequeError } = await supabase.from('cheques').insert({
        payment_id: payment.id,
        tenant_id: invoice.tenant_id,
        cheque_number,
        bank_name,
        cheque_date,
        amount: invoice.amount,
        status: 'pending',
      });

      if (chequeError) {
        return NextResponse.json({ error: chequeError.message }, { status: 500 });
      }
    }
  }

  // Mark the invoice as paid
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status,
      ...(status === 'paid' ? { paid_date: today } : {}),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
