import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CURRENCY } from "@/lib/currency";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params;
  const supabase = await createClient();

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("full_name, phone, email, national_id")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Fetch all unpaid/partial/overdue invoices for this tenant
  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id,
      amount,
      paid_amount,
      due_date,
      status,
      period_start,
      period_end,
      units!inner(unit_number, floor, properties!inner(name, location))
    `)
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "overdue", "partial"])
    .order("due_date", { ascending: true });

  const rows = invoices || [];

  const formatAmount = (n: number) =>
    n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Compute totals + recompute status (pending past due date = overdue visually)
  let totalDue = 0;
  let totalPaid = 0;
  const enriched = rows.map((inv) => {
    const unit = inv.units as unknown as {
      unit_number: string;
      floor: number | null;
      properties: { name: string; location: string | null };
    };
    const amount = parseFloat(inv.amount as string);
    const paid = parseFloat((inv.paid_amount as string) || "0");
    const remaining = Math.max(0, Math.round((amount - paid) * 100) / 100);
    totalDue += amount;
    totalPaid += paid;
    const isOverdue =
      inv.status === "overdue" ||
      (inv.status === "pending" && new Date(inv.due_date as string) < today);
    const statusLabel =
      inv.status === "partial"
        ? "PARTIAL"
        : isOverdue
          ? "OVERDUE"
          : "PENDING";
    const statusColor =
      inv.status === "partial"
        ? "#3b82f6"
        : isOverdue
          ? "#dc2626"
          : "#ca8a04";
    return { inv, unit, amount, paid, remaining, statusLabel, statusColor };
  });

  const outstandingBalance =
    Math.round((totalDue - totalPaid) * 100) / 100;

  const invoiceRows = enriched
    .map(({ inv, unit, amount, paid, remaining, statusLabel, statusColor }) => {
      const period =
        inv.period_start && inv.period_end
          ? `${formatDate(inv.period_start as string)} — ${formatDate(inv.period_end as string)}`
          : formatDate(inv.due_date as string);
      return `<tr>
        <td>${formatDate(inv.due_date as string)}</td>
        <td>
          <div class="desc-main">Monthly Rent — ${unit.properties.name}</div>
          <div class="desc-sub">Unit ${unit.unit_number}${unit.floor ? ` (Floor ${unit.floor})` : ""} · ${period}</div>
        </td>
        <td><span class="status-badge" style="background:${statusColor}">${statusLabel}</span></td>
        <td class="num">${formatAmount(amount)}</td>
        <td class="num paid">${paid > 0 ? `-${formatAmount(paid)}` : "—"}</td>
        <td class="num due">${formatAmount(remaining)}</td>
      </tr>`;
    })
    .join("");

  const emptyState = `
    <tr>
      <td colspan="6" class="empty">
        <div class="empty-icon">✓</div>
        <div class="empty-title">No outstanding invoices</div>
        <div class="empty-sub">This tenant is fully paid up.</div>
      </td>
    </tr>`;

  const t = (tenant as unknown as {
    full_name: string;
    phone: string | null;
    email: string | null;
    national_id: string | null;
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Remaining Invoices — ${t.full_name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; padding: 40px; max-width: 900px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #b8960c; padding-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 800; color: #b8960c; letter-spacing: 2px; }
    .logo-subtitle { font-size: 11px; color: #666; letter-spacing: 1px; margin-top: 4px; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 22px; color: #333; font-weight: 600; }
    .doc-title .subtitle { font-size: 12px; color: #666; margin-top: 4px; }
    .doc-title .date { font-size: 11px; color: #999; margin-top: 6px; font-family: monospace; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .detail-box { background: #f9f9f7; border: 1px solid #e5e5e0; border-radius: 8px; padding: 16px; }
    .detail-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 10px; }
    .detail-box p { font-size: 13px; color: #333; line-height: 1.8; }
    .detail-box .name { font-weight: 600; font-size: 15px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card { border: 1px solid #e5e5e0; border-radius: 8px; padding: 14px 16px; }
    .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 6px; }
    .summary-card .value { font-size: 18px; font-weight: 700; font-family: monospace; color: #333; }
    .summary-card.outstanding { background: #fef3c7; border-color: #fde68a; }
    .summary-card.outstanding .value { color: #92400e; }
    .summary-card.paid .value { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #b8960c; color: white; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 10px 12px; text-align: left; white-space: nowrap; }
    th.num { text-align: right; }
    td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
    td.num { text-align: right; font-family: monospace; font-weight: 600; white-space: nowrap; }
    td.paid { color: #16a34a; }
    td.due { color: #92400e; font-weight: 700; }
    .desc-main { font-weight: 600; color: #1a1a1a; margin-bottom: 2px; }
    .desc-sub { font-size: 11px; color: #888; }
    .status-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; color: white; letter-spacing: 0.5px; }
    .total-row { background: #fef3c7; }
    .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #b8960c; color: #92400e; padding: 14px 12px; }
    .empty { text-align: center; padding: 40px 16px; }
    .empty-icon { font-size: 32px; color: #16a34a; margin-bottom: 8px; }
    .empty-title { font-size: 16px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px; }
    .empty-sub { font-size: 13px; color: #888; }
    .footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; }
    .footer p { font-size: 11px; color: #999; }
    .notice { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #92400e; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
    .print-btn { position: fixed; top: 20px; right: 20px; background: #b8960c; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 600; z-index: 100; }
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
    <div class="doc-title">
      <h1>OUTSTANDING INVOICES</h1>
      <div class="subtitle">Statement of remaining rent due</div>
      <div class="date">Issued: ${todayStr}</div>
    </div>
  </div>

  <div class="details">
    <div class="detail-box">
      <h3>Tenant</h3>
      <p class="name">${t.full_name}</p>
      ${t.phone ? `<p>${t.phone}</p>` : ""}
      ${t.email ? `<p>${t.email}</p>` : ""}
      ${t.national_id ? `<p>ID: ${t.national_id}</p>` : ""}
    </div>
    <div class="detail-box">
      <h3>Summary</h3>
      <p><strong>${rows.length}</strong> outstanding invoice${rows.length === 1 ? "" : "s"}</p>
      <p>Total billed: <strong>${formatAmount(totalDue)} ${CURRENCY.code}</strong></p>
      <p>Total paid: <strong style="color:#16a34a">${formatAmount(totalPaid)} ${CURRENCY.code}</strong></p>
    </div>
  </div>

  ${rows.length > 0 ? `
  <div class="summary">
    <div class="summary-card">
      <div class="label">Total Billed</div>
      <div class="value">${formatAmount(totalDue)} ${CURRENCY.code}</div>
    </div>
    <div class="summary-card paid">
      <div class="label">Amount Paid</div>
      <div class="value">${formatAmount(totalPaid)} ${CURRENCY.code}</div>
    </div>
    <div class="summary-card outstanding">
      <div class="label">Balance Due</div>
      <div class="value">${formatAmount(outstandingBalance)} ${CURRENCY.code}</div>
    </div>
  </div>
  ` : ""}

  <table>
    <thead>
      <tr>
        <th>Due Date</th>
        <th>Description</th>
        <th>Status</th>
        <th class="num">Amount</th>
        <th class="num">Paid</th>
        <th class="num">Balance</th>
      </tr>
    </thead>
    <tbody>
      ${rows.length > 0 ? invoiceRows : emptyState}
      ${rows.length > 0 ? `
      <tr class="total-row">
        <td colspan="5">Total Outstanding Balance</td>
        <td class="num">${formatAmount(outstandingBalance)} ${CURRENCY.code}</td>
      </tr>
      ` : ""}
    </tbody>
  </table>

  ${rows.length > 0 ? `
  <div class="notice">
    Please settle the outstanding balance at your earliest convenience. If you have already made a payment not reflected here, kindly contact us with your payment reference.
  </div>
  ` : ""}

  <div class="footer">
    <p>This is a computer-generated document and does not require a signature.</p>
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
