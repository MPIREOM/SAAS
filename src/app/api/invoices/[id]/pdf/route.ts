import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CURRENCY } from "@/lib/currency";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch invoice with related data
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(`
      *,
      tenants!inner(full_name, phone, email, national_id),
      units!inner(unit_number, floor, properties!inner(name, location))
    `)
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Fetch payment records for this invoice's tenant/lease within the invoice period
  const { data: paymentRecords } = await supabase
    .from("payments")
    .select("amount, payment_date, method, reference_number")
    .eq("tenant_id", invoice.tenant_id)
    .eq("lease_id", invoice.lease_id)
    .gte("payment_date", invoice.period_start || invoice.due_date)
    .lte("payment_date", invoice.paid_date || new Date().toISOString().split("T")[0])
    .order("payment_date", { ascending: true });

  const tenant = invoice.tenants as unknown as {
    full_name: string;
    phone: string;
    email: string;
    national_id: string;
  };
  const unit = invoice.units as unknown as {
    unit_number: string;
    floor: number;
    properties: { name: string; location: string };
  };

  const invoiceDate = new Date(invoice.due_date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const totalAmount = parseFloat(invoice.amount);
  const paidAmount = parseFloat(invoice.paid_amount || "0");
  const balanceDue = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);
  const hasPaidAnything = paidAmount > 0;

  const statusLabel = invoice.status === "paid" ? "PAID" : invoice.status === "partial" ? "PARTIAL" : invoice.status === "overdue" ? "OVERDUE" : "PENDING";
  const statusColor = invoice.status === "paid" ? "#16a34a" : invoice.status === "partial" ? "#3b82f6" : invoice.status === "overdue" ? "#dc2626" : "#ca8a04";

  const formatAmount = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 2 });
  const formatMethod = (m: string) => m === "bank_transfer" ? "Bank Transfer" : m === "cash" ? "Cash" : m === "cheque" ? "Cheque" : m;

  // Build payment history rows for the table
  const payments = paymentRecords || [];
  const paymentRows = payments.map((p) => {
    const date = new Date(p.payment_date as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const amt = parseFloat(p.amount as string);
    return `<tr>
      <td style="color: #16a34a;">Payment - ${formatMethod(p.method as string)}${p.reference_number ? ` (Ref: ${p.reference_number})` : ""}</td>
      <td>${date}</td>
      <td style="color: #16a34a;">-${formatAmount(amt)} ${CURRENCY.code}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice - ${invoice.id.slice(0, 8).toUpperCase()}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #b8960c; padding-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 800; color: #b8960c; letter-spacing: 2px; }
    .logo-subtitle { font-size: 11px; color: #666; letter-spacing: 1px; margin-top: 4px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 24px; color: #333; font-weight: 600; }
    .invoice-number { font-size: 12px; color: #666; margin-top: 4px; font-family: monospace; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; color: white; background: ${statusColor}; margin-top: 8px; letter-spacing: 1px; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
    .detail-box { background: #f9f9f7; border: 1px solid #e5e5e0; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .detail-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 10px; }
    .detail-box p { font-size: 13px; color: #333; line-height: 1.8; }
    .detail-box .name { font-weight: 600; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #b8960c; color: white; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding: 12px 16px; text-align: left; }
    th:last-child { text-align: right; }
    td { padding: 14px 16px; border-bottom: 1px solid #eee; font-size: 14px; }
    td:last-child { text-align: right; font-family: monospace; font-weight: 600; }
    .total-row { background: #f9f9f7; }
    .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #b8960c; }
    .paid-row td { color: #16a34a; border-top: 1px solid #e5e5e0; }
    .balance-row { background: ${invoice.status === "paid" ? "#f0fdf4" : "#fef3c7"}; }
    .balance-row td { font-weight: 700; font-size: 16px; border-top: 2px solid ${invoice.status === "paid" ? "#16a34a" : "#b8960c"}; color: ${invoice.status === "paid" ? "#16a34a" : "#92400e"}; }
    .payment-section { margin-bottom: 20px; }
    .payment-table th { background: #f0fdf4; color: #16a34a; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
    .footer p { font-size: 11px; color: #999; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
    .print-btn { position: fixed; top: 20px; right: 20px; background: #b8960c; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 600; }
    .print-btn:hover { background: #9a7d0a; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>

  <div class="header">
    <div>
      <div class="logo">MPIRE</div>
      <div class="logo-subtitle">PROPERTY MANAGEMENT</div>
    </div>
    <div class="invoice-title">
      <h1>INVOICE</h1>
      <div class="invoice-number">#${invoice.id.slice(0, 8).toUpperCase()}</div>
      <div class="status">${statusLabel}</div>
    </div>
  </div>

  <div class="details">
    <div class="detail-box">
      <h3>Bill To</h3>
      <p class="name">${tenant.full_name}</p>
      <p>${tenant.phone || ""}</p>
      <p>${tenant.email || ""}</p>
      ${tenant.national_id ? `<p>ID: ${tenant.national_id}</p>` : ""}
    </div>
    <div class="detail-box">
      <h3>Property Details</h3>
      <p class="name">${unit.properties.name}</p>
      <p>${unit.properties.location || ""}</p>
      <p>Unit: ${unit.unit_number}${unit.floor ? ` (Floor ${unit.floor})` : ""}</p>
      <p>Date: ${invoiceDate}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Period</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Monthly Rent - Unit ${unit.unit_number}</td>
        <td>${invoice.period_start ? `${invoice.period_start} to ${invoice.period_end}` : invoiceDate}</td>
        <td>${formatAmount(totalAmount)} ${CURRENCY.code}</td>
      </tr>
      <tr class="total-row">
        <td colspan="2">Total Due</td>
        <td>${formatAmount(totalAmount)} ${CURRENCY.code}</td>
      </tr>
      ${hasPaidAnything ? `
      <tr class="paid-row">
        <td colspan="2">Amount Paid</td>
        <td>-${formatAmount(paidAmount)} ${CURRENCY.code}</td>
      </tr>
      <tr class="balance-row">
        <td colspan="2">${invoice.status === "paid" ? "Balance (Fully Paid)" : "Balance Due"}</td>
        <td>${formatAmount(balanceDue)} ${CURRENCY.code}</td>
      </tr>
      ` : ""}
    </tbody>
  </table>

  ${hasPaidAnything && payments.length > 0 ? `
  <div class="payment-section">
    <table class="payment-table">
      <thead>
        <tr>
          <th>Payment Details</th>
          <th>Date</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows}
      </tbody>
    </table>
  </div>
  ` : ""}

  ${invoice.status === "paid" ? `
  <div class="detail-box" style="background: #f0fdf4; border-color: #bbf7d0;">
    <h3 style="color: #16a34a;">Fully Paid</h3>
    <p>Paid on: ${invoice.paid_date ? new Date(invoice.paid_date).toLocaleDateString("en-GB") : "—"}</p>
  </div>
  ` : ""}

  ${invoice.status === "partial" ? `
  <div class="detail-box" style="background: #eff6ff; border-color: #bfdbfe;">
    <h3 style="color: #3b82f6;">Partial Payment</h3>
    <p>Paid so far: ${formatAmount(paidAmount)} ${CURRENCY.code} of ${formatAmount(totalAmount)} ${CURRENCY.code}</p>
    <p>Remaining balance: ${formatAmount(balanceDue)} ${CURRENCY.code}</p>
  </div>
  ` : ""}

  <div class="footer">
    <p>${invoice.status === "paid" ? "Thank you for your payment." : "Please ensure payment is made by the due date."} This is a computer-generated document.</p>
    <p style="margin-top: 4px;">MPIRE Property Management</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
