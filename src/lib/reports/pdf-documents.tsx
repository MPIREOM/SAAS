import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// ─── Shared styles ────────────────────────────────────────────────────────────

const ACCENT = "#16a34a";
const ACCENT_LIGHT = "#dcfce7";
const TEXT_PRIMARY = "#111827";
const TEXT_SECONDARY = "#6b7280";
const BORDER = "#e5e7eb";
const SURFACE = "#f9fafb";
const DESTRUCTIVE = "#dc2626";
const WARNING = "#d97706";

const shared = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: TEXT_PRIMARY,
    backgroundColor: "#ffffff",
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
  },
  headerLeft: { flexDirection: "column" },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 2 },
  reportTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: TEXT_PRIMARY, marginBottom: 2 },
  reportSubtitle: { fontSize: 8, color: TEXT_SECONDARY },
  headerRight: { flexDirection: "column", alignItems: "flex-end" },
  dateLabel: { fontSize: 8, color: TEXT_SECONDARY, marginBottom: 2 },
  dateValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEXT_PRIMARY },
  // Section
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEXT_SECONDARY, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  // Table
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: "hidden" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRowLast: { flexDirection: "row" },
  tableRowAlt: { flexDirection: "row", backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  tableHeaderCell: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: TEXT_SECONDARY, textTransform: "uppercase", paddingVertical: 6, paddingHorizontal: 8, letterSpacing: 0.4 },
  tableCell: { fontSize: 8.5, color: TEXT_PRIMARY, paddingVertical: 6, paddingHorizontal: 8 },
  tableCellMono: { fontSize: 8.5, color: TEXT_PRIMARY, paddingVertical: 6, paddingHorizontal: 8, fontFamily: "Courier" },
  tableCellSecondary: { fontSize: 8.5, color: TEXT_SECONDARY, paddingVertical: 6, paddingHorizontal: 8 },
  // Badges
  badgeGreen: { backgroundColor: ACCENT_LIGHT, color: ACCENT, fontSize: 7, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 10, alignSelf: "flex-start" },
  badgeRed: { backgroundColor: "#fee2e2", color: DESTRUCTIVE, fontSize: 7, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 10, alignSelf: "flex-start" },
  badgeYellow: { backgroundColor: "#fef3c7", color: WARNING, fontSize: 7, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 10, alignSelf: "flex-start" },
  badgeGray: { backgroundColor: "#f3f4f6", color: TEXT_SECONDARY, fontSize: 7, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 10, alignSelf: "flex-start" },
  // Summary cards row
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 10 },
  summaryLabel: { fontSize: 7.5, color: TEXT_SECONDARY, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: TEXT_PRIMARY },
  summaryValueAccent: { fontSize: 14, fontFamily: "Helvetica-Bold", color: ACCENT },
  summaryValueRed: { fontSize: 14, fontFamily: "Helvetica-Bold", color: DESTRUCTIVE },
  summaryValueYellow: { fontSize: 14, fontFamily: "Helvetica-Bold", color: WARNING },
  // Footer
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6 },
  footerText: { fontSize: 7.5, color: TEXT_SECONDARY },
});

// ─── Header component ──────────────────────────────────────────────────────────

function PDFHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <View style={shared.header}>
      <View style={shared.headerLeft}>
        <Text style={shared.brand}>MPIRE</Text>
        <Text style={shared.reportTitle}>{title}</Text>
        {subtitle && <Text style={shared.reportSubtitle}>{subtitle}</Text>}
      </View>
      <View style={shared.headerRight}>
        <Text style={shared.dateLabel}>Generated on</Text>
        <Text style={shared.dateValue}>{now}</Text>
      </View>
    </View>
  );
}

function PDFFooter({ reportName }: { reportName: string }) {
  return (
    <View style={shared.footer} fixed>
      <Text style={shared.footerText}>MPIRE Property Management · {reportName}</Text>
      <Text style={shared.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// ─── 1. Monthly Rent Collection ────────────────────────────────────────────────

export interface RentCollectionData {
  invoices: {
    id: string;
    tenant_name: string;
    unit_number: string;
    property_name: string;
    amount: number;
    due_date: string;
    status: string;
    paid_date?: string | null;
  }[];
  month: string;
}

export function RentCollectionPDF({ data }: { data: RentCollectionData }) {
  const paid = data.invoices.filter((i) => i.status === "paid");
  const pending = data.invoices.filter((i) => i.status === "pending");
  const overdue = data.invoices.filter((i) => i.status === "overdue");
  const totalCollected = paid.reduce((s, i) => s + i.amount, 0);
  const totalOutstanding = [...pending, ...overdue].reduce((s, i) => s + i.amount, 0);
  const rate = data.invoices.length > 0 ? Math.round((paid.length / data.invoices.length) * 100) : 0;

  const statusBadge = (status: string) => {
    if (status === "paid") return <Text style={shared.badgeGreen}>Paid</Text>;
    if (status === "overdue") return <Text style={shared.badgeRed}>Overdue</Text>;
    return <Text style={shared.badgeYellow}>Pending</Text>;
  };

  const cols = { tenant: "28%", unit: "16%", property: "20%", amount: "13%", due: "13%", status: "10%" };

  return (
    <Document>
      <Page size="A4" style={shared.page}>
        <PDFHeader title="Monthly Rent Collection" subtitle={`Period: ${data.month}`} />

        {/* Summary */}
        <View style={shared.summaryRow}>
          <View style={shared.summaryCard}>
            <Text style={shared.summaryLabel}>Total Invoices</Text>
            <Text style={shared.summaryValue}>{data.invoices.length}</Text>
          </View>
          <View style={shared.summaryCard}>
            <Text style={shared.summaryLabel}>Collected</Text>
            <Text style={shared.summaryValueAccent}>{totalCollected.toFixed(2)} OMR</Text>
          </View>
          <View style={shared.summaryCard}>
            <Text style={shared.summaryLabel}>Outstanding</Text>
            <Text style={shared.summaryValueRed}>{totalOutstanding.toFixed(2)} OMR</Text>
          </View>
          <View style={shared.summaryCard}>
            <Text style={shared.summaryLabel}>Collection Rate</Text>
            <Text style={shared.summaryValue}>{rate}%</Text>
          </View>
        </View>

        {/* Table */}
        <View style={shared.section}>
          <Text style={shared.sectionTitle}>Invoice Details</Text>
          <View style={shared.table}>
            <View style={shared.tableHeaderRow}>
              <Text style={[shared.tableHeaderCell, { width: cols.tenant }]}>Tenant</Text>
              <Text style={[shared.tableHeaderCell, { width: cols.unit }]}>Unit</Text>
              <Text style={[shared.tableHeaderCell, { width: cols.property }]}>Property</Text>
              <Text style={[shared.tableHeaderCell, { width: cols.amount }]}>Amount</Text>
              <Text style={[shared.tableHeaderCell, { width: cols.due }]}>Due Date</Text>
              <Text style={[shared.tableHeaderCell, { width: cols.status }]}>Status</Text>
            </View>
            {data.invoices.map((inv, i) => (
              <View key={inv.id} style={i === data.invoices.length - 1 ? shared.tableRowLast : i % 2 === 0 ? shared.tableRow : shared.tableRowAlt}>
                <Text style={[shared.tableCell, { width: cols.tenant }]}>{inv.tenant_name}</Text>
                <Text style={[shared.tableCellMono, { width: cols.unit }]}>{inv.unit_number}</Text>
                <Text style={[shared.tableCellSecondary, { width: cols.property }]}>{inv.property_name}</Text>
                <Text style={[shared.tableCellMono, { width: cols.amount }]}>{inv.amount.toFixed(2)}</Text>
                <Text style={[shared.tableCellMono, { width: cols.due }]}>{inv.due_date}</Text>
                <View style={{ width: cols.status, paddingVertical: 5, paddingHorizontal: 8 }}>
                  {statusBadge(inv.status)}
                </View>
              </View>
            ))}
          </View>
        </View>

        <PDFFooter reportName="Monthly Rent Collection" />
      </Page>
    </Document>
  );
}

// ─── 2. Tenant Roster ─────────────────────────────────────────────────────────

export interface TenantRosterData {
  tenants: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    nationality: string;
    national_id: string;
    unit_number: string;
    property_name: string;
    start_date: string;
    end_date: string;
    monthly_rent: number;
    status: string;
  }[];
}

export function TenantRosterPDF({ data }: { data: TenantRosterData }) {
  const cols = { name: "22%", contact: "20%", unit: "12%", property: "16%", lease: "18%", rent: "12%" };
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={shared.page}>
        <PDFHeader title="Tenant Roster" subtitle={`${data.tenants.length} active tenant${data.tenants.length !== 1 ? "s" : ""}`} />

        <View style={shared.summaryRow}>
          <View style={shared.summaryCard}>
            <Text style={shared.summaryLabel}>Total Active Tenants</Text>
            <Text style={shared.summaryValueAccent}>{data.tenants.length}</Text>
          </View>
          <View style={shared.summaryCard}>
            <Text style={shared.summaryLabel}>Total Monthly Rent</Text>
            <Text style={shared.summaryValue}>{data.tenants.reduce((s, t) => s + t.monthly_rent, 0).toFixed(2)} OMR</Text>
          </View>
        </View>

        <View style={shared.table}>
          <View style={shared.tableHeaderRow}>
            <Text style={[shared.tableHeaderCell, { width: cols.name }]}>Tenant Name</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.contact }]}>Contact</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.unit }]}>Unit</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.property }]}>Property</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.lease }]}>Lease Period</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.rent }]}>Rent / mo</Text>
          </View>
          {data.tenants.map((t, i) => (
            <View key={t.id} style={i === data.tenants.length - 1 ? shared.tableRowLast : i % 2 === 0 ? shared.tableRow : shared.tableRowAlt}>
              <View style={{ width: cols.name, paddingVertical: 6, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: TEXT_PRIMARY }}>{t.full_name}</Text>
                <Text style={{ fontSize: 7.5, color: TEXT_SECONDARY, marginTop: 1 }}>{t.nationality || "—"} · {t.national_id || "—"}</Text>
              </View>
              <View style={{ width: cols.contact, paddingVertical: 6, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 8.5, color: TEXT_PRIMARY }}>{t.phone}</Text>
                <Text style={{ fontSize: 7.5, color: TEXT_SECONDARY, marginTop: 1 }}>{t.email || "—"}</Text>
              </View>
              <Text style={[shared.tableCellMono, { width: cols.unit }]}>{t.unit_number}</Text>
              <Text style={[shared.tableCellSecondary, { width: cols.property }]}>{t.property_name}</Text>
              <Text style={[shared.tableCellMono, { width: cols.lease, fontSize: 7.5 }]}>{t.start_date}{"\n"}{t.end_date}</Text>
              <Text style={[shared.tableCellMono, { width: cols.rent }]}>{t.monthly_rent.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <PDFFooter reportName="Tenant Roster" />
      </Page>
    </Document>
  );
}

// ─── 3. Maintenance Summary ───────────────────────────────────────────────────

export interface MaintenanceData {
  requests: {
    id: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    tenant_name: string;
    unit_number: string;
    created_at: string;
    estimated_cost: number | null;
  }[];
}

export function MaintenancePDF({ data }: { data: MaintenanceData }) {
  const open = data.requests.filter((r) => r.status === "open").length;
  const inProgress = data.requests.filter((r) => r.status === "in_progress").length;
  const resolved = data.requests.filter((r) => r.status === "resolved").length;
  const totalCost = data.requests.reduce((s, r) => s + (r.estimated_cost ?? 0), 0);

  const priorityBadge = (p: string) => {
    if (p === "emergency") return <Text style={shared.badgeRed}>{p}</Text>;
    if (p === "high") return <Text style={shared.badgeYellow}>{p}</Text>;
    return <Text style={shared.badgeGray}>{p}</Text>;
  };
  const statusBadge = (s: string) => {
    if (s === "resolved") return <Text style={shared.badgeGreen}>{s}</Text>;
    if (s === "in_progress") return <Text style={shared.badgeYellow}>{s}</Text>;
    return <Text style={shared.badgeGray}>{s}</Text>;
  };

  const cols = { title: "26%", category: "14%", priority: "11%", status: "12%", tenant: "18%", unit: "10%", date: "9%" };

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={shared.page}>
        <PDFHeader title="Maintenance Summary" subtitle={`${data.requests.length} total request${data.requests.length !== 1 ? "s" : ""}`} />

        <View style={shared.summaryRow}>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Open</Text><Text style={shared.summaryValueYellow}>{open}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>In Progress</Text><Text style={shared.summaryValueYellow}>{inProgress}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Resolved</Text><Text style={shared.summaryValueAccent}>{resolved}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Est. Total Cost</Text><Text style={shared.summaryValue}>{totalCost.toFixed(2)} OMR</Text></View>
        </View>

        <View style={shared.table}>
          <View style={shared.tableHeaderRow}>
            <Text style={[shared.tableHeaderCell, { width: cols.title }]}>Title</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.category }]}>Category</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.priority }]}>Priority</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.status }]}>Status</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.tenant }]}>Tenant</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.unit }]}>Unit</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.date }]}>Date</Text>
          </View>
          {data.requests.map((r, i) => (
            <View key={r.id} style={i === data.requests.length - 1 ? shared.tableRowLast : i % 2 === 0 ? shared.tableRow : shared.tableRowAlt}>
              <Text style={[shared.tableCell, { width: cols.title }]}>{r.title}</Text>
              <Text style={[shared.tableCellSecondary, { width: cols.category }]}>{r.category || "—"}</Text>
              <View style={{ width: cols.priority, paddingVertical: 5, paddingHorizontal: 8 }}>{priorityBadge(r.priority || "low")}</View>
              <View style={{ width: cols.status, paddingVertical: 5, paddingHorizontal: 8 }}>{statusBadge(r.status)}</View>
              <Text style={[shared.tableCell, { width: cols.tenant }]}>{r.tenant_name}</Text>
              <Text style={[shared.tableCellMono, { width: cols.unit }]}>{r.unit_number}</Text>
              <Text style={[shared.tableCellMono, { width: cols.date, fontSize: 7.5 }]}>{r.created_at}</Text>
            </View>
          ))}
        </View>

        <PDFFooter reportName="Maintenance Summary" />
      </Page>
    </Document>
  );
}

// ─── 4. Cheque Tracker ────────────────────────────────────────────────────────

export interface ChequeTrackerData {
  cheques: {
    id: string;
    cheque_number: string;
    bank_name: string;
    cheque_date: string;
    amount: number;
    status: string;
    tenant_name: string;
    notes: string | null;
  }[];
}

export function ChequeTrackerPDF({ data }: { data: ChequeTrackerData }) {
  const pending = data.cheques.filter((c) => c.status === "pending").length;
  const cleared = data.cheques.filter((c) => c.status === "cleared").length;
  const bounced = data.cheques.filter((c) => c.status === "bounced").length;
  const totalValue = data.cheques.filter((c) => c.status !== "cancelled").reduce((s, c) => s + c.amount, 0);

  const statusBadge = (s: string) => {
    if (s === "cleared") return <Text style={shared.badgeGreen}>Cleared</Text>;
    if (s === "bounced") return <Text style={shared.badgeRed}>Bounced</Text>;
    if (s === "pending") return <Text style={shared.badgeYellow}>Pending</Text>;
    return <Text style={shared.badgeGray}>Cancelled</Text>;
  };

  const cols = { chequeNo: "13%", tenant: "22%", bank: "18%", date: "12%", amount: "13%", status: "11%", notes: "11%" };

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={shared.page}>
        <PDFHeader title="Cheque Tracker" subtitle={`${data.cheques.length} total cheque${data.cheques.length !== 1 ? "s" : ""}`} />

        <View style={shared.summaryRow}>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Pending</Text><Text style={shared.summaryValueYellow}>{pending}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Cleared</Text><Text style={shared.summaryValueAccent}>{cleared}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Bounced</Text><Text style={shared.summaryValueRed}>{bounced}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Total Value</Text><Text style={shared.summaryValue}>{totalValue.toFixed(2)} OMR</Text></View>
        </View>

        <View style={shared.table}>
          <View style={shared.tableHeaderRow}>
            <Text style={[shared.tableHeaderCell, { width: cols.chequeNo }]}>Cheque #</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.tenant }]}>Tenant</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.bank }]}>Bank</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.date }]}>Date</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.amount }]}>Amount</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.status }]}>Status</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.notes }]}>Notes</Text>
          </View>
          {data.cheques.map((c, i) => (
            <View key={c.id} style={i === data.cheques.length - 1 ? shared.tableRowLast : i % 2 === 0 ? shared.tableRow : shared.tableRowAlt}>
              <Text style={[shared.tableCellMono, { width: cols.chequeNo }]}>#{c.cheque_number}</Text>
              <Text style={[shared.tableCell, { width: cols.tenant }]}>{c.tenant_name}</Text>
              <Text style={[shared.tableCellSecondary, { width: cols.bank }]}>{c.bank_name}</Text>
              <Text style={[shared.tableCellMono, { width: cols.date }]}>{c.cheque_date}</Text>
              <Text style={[shared.tableCellMono, { width: cols.amount }]}>{c.amount.toFixed(2)}</Text>
              <View style={{ width: cols.status, paddingVertical: 5, paddingHorizontal: 8 }}>{statusBadge(c.status)}</View>
              <Text style={[shared.tableCellSecondary, { width: cols.notes }]}>{c.notes || "—"}</Text>
            </View>
          ))}
        </View>

        <PDFFooter reportName="Cheque Tracker" />
      </Page>
    </Document>
  );
}

// ─── 5. Document Expiry ───────────────────────────────────────────────────────

export interface DocumentExpiryData {
  documents: {
    id: string;
    tenant_name: string;
    document_type: string;
    file_name: string | null;
    expiry_date: string;
    days_until_expiry: number;
  }[];
}

export function DocumentExpiryPDF({ data }: { data: DocumentExpiryData }) {
  const expired = data.documents.filter((d) => d.days_until_expiry < 0).length;
  const expiringSoon = data.documents.filter((d) => d.days_until_expiry >= 0 && d.days_until_expiry <= 30).length;
  const expiring60 = data.documents.filter((d) => d.days_until_expiry > 30 && d.days_until_expiry <= 60).length;

  const statusBadge = (days: number) => {
    if (days < 0) return <Text style={shared.badgeRed}>Expired</Text>;
    if (days <= 30) return <Text style={shared.badgeYellow}>Expiring Soon</Text>;
    return <Text style={shared.badgeGray}>{days}d left</Text>;
  };

  const cols = { tenant: "26%", type: "22%", file: "22%", expiry: "15%", status: "15%" };

  return (
    <Document>
      <Page size="A4" style={shared.page}>
        <PDFHeader title="Document Expiry Report" subtitle="Documents expiring within 90 days or already expired" />

        <View style={shared.summaryRow}>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Total Documents</Text><Text style={shared.summaryValue}>{data.documents.length}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Expired</Text><Text style={shared.summaryValueRed}>{expired}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Expiring ≤ 30 days</Text><Text style={shared.summaryValueYellow}>{expiringSoon}</Text></View>
          <View style={shared.summaryCard}><Text style={shared.summaryLabel}>Expiring ≤ 60 days</Text><Text style={shared.summaryValue}>{expiring60}</Text></View>
        </View>

        <View style={shared.table}>
          <View style={shared.tableHeaderRow}>
            <Text style={[shared.tableHeaderCell, { width: cols.tenant }]}>Tenant</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.type }]}>Document Type</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.file }]}>File Name</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.expiry }]}>Expiry Date</Text>
            <Text style={[shared.tableHeaderCell, { width: cols.status }]}>Status</Text>
          </View>
          {data.documents.map((d, i) => (
            <View key={d.id} style={i === data.documents.length - 1 ? shared.tableRowLast : i % 2 === 0 ? shared.tableRow : shared.tableRowAlt}>
              <Text style={[shared.tableCell, { width: cols.tenant }]}>{d.tenant_name}</Text>
              <Text style={[shared.tableCellSecondary, { width: cols.type }]}>{d.document_type.replace(/_/g, " ")}</Text>
              <Text style={[shared.tableCellSecondary, { width: cols.file }]}>{d.file_name || "—"}</Text>
              <Text style={[shared.tableCellMono, { width: cols.expiry }]}>{d.expiry_date}</Text>
              <View style={{ width: cols.status, paddingVertical: 5, paddingHorizontal: 8 }}>{statusBadge(d.days_until_expiry)}</View>
            </View>
          ))}
        </View>

        <PDFFooter reportName="Document Expiry Report" />
      </Page>
    </Document>
  );
}
