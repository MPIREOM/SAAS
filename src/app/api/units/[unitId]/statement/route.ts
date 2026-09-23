import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CURRENCY } from "@/lib/currency";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import {
  buildStatement,
  parseMonthParam,
  type StatementInvoice,
  type StatementRow,
} from "@/lib/invoices/statement";

// Printable, bilingual (EN + AR) Statement of Account for the active lease
// on a unit. Optional ?from=YYYY-MM&to=YYYY-MM narrows the months shown;
// anything owed before `from` is carried in as a brought-forward balance.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, unit_number, floor, property_id, properties(name, location)")
    .eq("id", unitId)
    .single();

  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null && !propertyIds.includes(unit.property_id as string)) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("id, start_date, end_date, monthly_rent, tenants(full_name, phone, email, national_id)")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .single();

  if (!lease) {
    return NextResponse.json({ error: "No active lease on this unit" }, { status: 404 });
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, amount, paid_amount, due_date, period_start, period_end, status")
    .eq("lease_id", lease.id)
    .in("status", ["pending", "overdue", "partial", "paid", "written_off"]);

  let from = parseMonthParam(request.nextUrl.searchParams.get("from"));
  let to = parseMonthParam(request.nextUrl.searchParams.get("to"));
  if (from && to && from > to) [from, to] = [to, from];

  const today = new Date();
  const statement = buildStatement((invoices || []) as StatementInvoice[], {
    from,
    to,
    today,
  });

  const tenant = lease.tenants as unknown as {
    full_name: string;
    phone: string | null;
    email: string | null;
    national_id: string | null;
  } | null;
  const property = unit.properties as unknown as { name: string; location: string | null } | null;

  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const money = (n: number) =>
    n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const date = (d: string) =>
    new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  const monthLabel = (key: string, locale: "en" | "ar") =>
    new Date(`${key}-01T00:00:00Z`).toLocaleDateString(
      locale === "ar" ? "ar-OM-u-nu-latn" : "en-GB",
      { month: "long", year: "numeric", timeZone: "UTC" }
    );

  const STATUS: Record<StatementRow["status"], { en: string; ar: string; color: string }> = {
    paid: { en: "PAID", ar: "مدفوع", color: "#16a34a" },
    partial: { en: "PARTIAL", ar: "مدفوع جزئياً", color: "#3b82f6" },
    overdue: { en: "OVERDUE", ar: "متأخر", color: "#dc2626" },
    pending: { en: "PENDING", ar: "مستحق", color: "#ca8a04" },
    written_off: { en: "WRITTEN OFF", ar: "مشطوب", color: "#6b7280" },
  };

  const bi = (en: string, ar: string) =>
    `${en} <span class="ar" lang="ar" dir="rtl">${ar}</span>`;

  const periodText = from || to
    ? `${from ? monthLabel(from, "en") : date(lease.start_date as string)} — ${to ? monthLabel(to, "en") : "Today"}`
    : `${date(lease.start_date as string)} — ${date(lease.end_date as string)}`;

  const openingRow = from
    ? `<tr class="opening-row">
        <td colspan="6">${bi("Balance brought forward", "الرصيد المرحّل")}</td>
        <td class="num">${money(statement.openingBalance)}</td>
      </tr>`
    : "";

  const bodyRows = statement.rows
    .map((row) => {
      const s = STATUS[row.status];
      const period =
        row.periodStart && row.periodEnd
          ? `${date(row.periodStart)} — ${date(row.periodEnd)}`
          : "";
      return `<tr>
        <td>
          <div class="desc-main">${monthLabel(row.monthKey, "en")}</div>
          <div class="desc-sub ar" lang="ar" dir="rtl">${monthLabel(row.monthKey, "ar")}</div>
          ${period ? `<div class="desc-sub">${period}</div>` : ""}
        </td>
        <td class="nowrap">${date(row.dueDate)}</td>
        <td><span class="status-badge" style="background:${s.color}">${s.en}</span><div class="desc-sub ar" lang="ar" dir="rtl">${s.ar}</div></td>
        <td class="num">${money(row.amount)}</td>
        <td class="num ${row.paid > 0 ? "paid" : ""}">${row.paid > 0 ? money(row.paid) : "—"}</td>
        <td class="num ${row.balance > 0 ? "due" : ""}">${row.balance > 0 ? money(row.balance) : "—"}</td>
        <td class="num running">${money(row.runningBalance)}</td>
      </tr>`;
    })
    .join("");

  const emptyRow = `<tr><td colspan="7" class="empty">
      ${bi("No invoices in this period.", "لا توجد فواتير في هذه الفترة.")}
    </td></tr>`;

  const settled = statement.closingBalance <= 0;
  const todayStr = today.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const cur = CURRENCY.code;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Statement of Account — ${esc(tenant?.full_name)} — Unit ${esc(unit.unit_number)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif; color: #1a1a1a; padding: 40px; max-width: 960px; margin: 0 auto; }
    .ar { font-family: 'Segoe UI', Tahoma, 'Noto Sans Arabic', 'Geeza Pro', sans-serif; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 3px solid #b8960c; padding-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 800; color: #b8960c; letter-spacing: 2px; }
    .logo-subtitle { font-size: 11px; color: #666; letter-spacing: 1px; margin-top: 4px; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 22px; color: #333; font-weight: 600; }
    .doc-title h2 { font-size: 18px; color: #555; font-weight: 600; margin-top: 2px; }
    .doc-title .date { font-size: 11px; color: #999; margin-top: 6px; font-family: monospace; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .detail-box { background: #f9f9f7; border: 1px solid #e5e5e0; border-radius: 8px; padding: 16px; }
    .detail-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 10px; }
    .detail-box h3 .ar { text-transform: none; letter-spacing: 0; font-size: 11px; margin-inline-start: 6px; }
    .detail-box p { font-size: 13px; color: #333; line-height: 1.8; }
    .detail-box .name { font-weight: 600; font-size: 15px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card { border: 1px solid #e5e5e0; border-radius: 8px; padding: 14px 16px; }
    .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 6px; }
    .summary-card .label .ar { text-transform: none; letter-spacing: 0; font-size: 11px; display: block; margin-top: 2px; }
    .summary-card .value { font-size: 18px; font-weight: 700; font-family: monospace; color: #333; }
    .summary-card .count { font-size: 11px; color: #888; margin-top: 4px; }
    .summary-card.paid .value { color: #16a34a; }
    .summary-card.outstanding { background: #fef3c7; border-color: #fde68a; }
    .summary-card.outstanding .value { color: #92400e; }
    .summary-card.settled { background: #dcfce7; border-color: #bbf7d0; }
    .summary-card.settled .value { color: #166534; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #b8960c; color: white; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 10px; text-align: left; vertical-align: bottom; }
    th .ar { display: block; text-transform: none; letter-spacing: 0; font-size: 11px; font-weight: 500; margin-top: 2px; }
    th.num { text-align: right; }
    td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
    td.num { text-align: right; font-family: monospace; font-weight: 600; white-space: nowrap; }
    td.nowrap { white-space: nowrap; }
    td.paid { color: #16a34a; }
    td.due { color: #92400e; font-weight: 700; }
    td.running { color: #333; background: #fafaf7; }
    .desc-main { font-weight: 600; color: #1a1a1a; }
    .desc-sub { font-size: 11px; color: #888; margin-top: 2px; }
    td .ar { text-align: left; }
    .status-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; color: white; letter-spacing: 0.5px; white-space: nowrap; }
    .opening-row td { background: #f9f9f7; font-style: italic; color: #555; }
    .total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #b8960c; padding: 14px 10px; background: #fef3c7; color: #92400e; }
    .total-row.settled td { background: #dcfce7; color: #166534; }
    .empty { text-align: center; padding: 32px 16px; color: #888; }
    .notice { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #92400e; line-height: 1.7; }
    .notice .ar { display: block; margin-top: 6px; }
    .footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; }
    .footer p { font-size: 11px; color: #999; line-height: 1.7; }
    .print-btn { position: fixed; top: 20px; right: 20px; background: #b8960c; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 600; z-index: 100; }
    .print-btn:hover { background: #9a7d0a; }
    @media (max-width: 640px) {
      body { padding: 16px; }
      .header, .details, .summary { display: block; }
      .doc-title { text-align: left; margin-top: 12px; }
      .detail-box, .summary-card { margin-bottom: 12px; }
      table { display: block; overflow-x: auto; }
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
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
      <h1>STATEMENT OF ACCOUNT</h1>
      <h2 class="ar" lang="ar" dir="rtl">كشف حساب</h2>
      <div class="date">Issued: ${todayStr}</div>
    </div>
  </div>

  <div class="details">
    <div class="detail-box">
      <h3>Tenant <span class="ar" lang="ar" dir="rtl">المستأجر</span></h3>
      <p class="name">${esc(tenant?.full_name)}</p>
      ${tenant?.phone ? `<p>${esc(tenant.phone)}</p>` : ""}
      ${tenant?.email ? `<p>${esc(tenant.email)}</p>` : ""}
      ${tenant?.national_id ? `<p>ID: ${esc(tenant.national_id)}</p>` : ""}
    </div>
    <div class="detail-box">
      <h3>Property <span class="ar" lang="ar" dir="rtl">العقار</span></h3>
      <p class="name">${esc(property?.name)} — Unit ${esc(unit.unit_number)}${unit.floor ? ` (Floor ${esc(unit.floor)})` : ""}</p>
      ${property?.location ? `<p>${esc(property.location)}</p>` : ""}
      <p>Monthly rent: <strong>${money(parseFloat(String(lease.monthly_rent)))} ${cur}</strong></p>
      <p>Statement period: <strong>${periodText}</strong></p>
    </div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Total Billed <span class="ar" lang="ar" dir="rtl">إجمالي المستحق</span></div>
      <div class="value">${money(statement.totalBilled)} ${cur}</div>
      <div class="count">${statement.rows.length} month${statement.rows.length === 1 ? "" : "s"}</div>
    </div>
    <div class="summary-card paid">
      <div class="label">Total Paid <span class="ar" lang="ar" dir="rtl">إجمالي المدفوع</span></div>
      <div class="value">${money(statement.totalPaid)} ${cur}</div>
      <div class="count">${statement.paidCount} paid in full</div>
    </div>
    <div class="summary-card ${settled ? "settled" : "outstanding"}">
      <div class="label">Balance Due <span class="ar" lang="ar" dir="rtl">الرصيد المستحق</span></div>
      <div class="value">${money(statement.closingBalance)} ${cur}</div>
      <div class="count">${statement.unpaidCount} month${statement.unpaidCount === 1 ? "" : "s"} pending</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Month <span class="ar" lang="ar" dir="rtl">الشهر</span></th>
        <th>Due Date <span class="ar" lang="ar" dir="rtl">تاريخ الاستحقاق</span></th>
        <th>Status <span class="ar" lang="ar" dir="rtl">الحالة</span></th>
        <th class="num">Rent (${cur}) <span class="ar" lang="ar" dir="rtl">الإيجار</span></th>
        <th class="num">Paid <span class="ar" lang="ar" dir="rtl">المدفوع</span></th>
        <th class="num">Balance <span class="ar" lang="ar" dir="rtl">المتبقي</span></th>
        <th class="num">Running Balance <span class="ar" lang="ar" dir="rtl">الرصيد التراكمي</span></th>
      </tr>
    </thead>
    <tbody>
      ${openingRow}
      ${statement.rows.length > 0 ? bodyRows : emptyRow}
      <tr class="total-row ${settled ? "settled" : ""}">
        <td colspan="6">${bi("Closing Balance", "الرصيد الختامي")}</td>
        <td class="num">${money(statement.closingBalance)} ${cur}</td>
      </tr>
    </tbody>
  </table>

  ${settled ? "" : `
  <div class="notice">
    Please settle the outstanding balance at your earliest convenience. If you have already made a payment not reflected here, kindly contact us with your payment reference.
    <span class="ar" lang="ar" dir="rtl">يرجى سداد الرصيد المستحق في أقرب وقت ممكن. إذا قمتم بالدفع ولم يظهر في هذا الكشف، يرجى التواصل معنا مع ذكر مرجع الدفع.</span>
  </div>`}

  <div class="footer">
    <p>This is a computer-generated document and does not require a signature.</p>
    <p class="ar" lang="ar" dir="rtl">هذا مستند صادر إلكترونياً ولا يتطلب توقيعاً.</p>
    <p style="margin-top: 4px;">MPIRE Property Management</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
