import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";
import { CURRENCY, formatCurrency } from "@/lib/currency";
import type { MonthlyReport } from "./monthly-report-data";

// Register Thmanyah Sans (Latin + Arabic). The default Helvetica that
// ships with @react-pdf/renderer doesn't have Arabic glyphs, so tenant
// names like "أحمد النبهاني" came out as garbage.
//
// Encode the OTF bytes as a data: URL at module load and pass that to
// Font.register. @react-pdf/font/lib/index.js explicitly handles
// data URLs (see isDataUrl branch) — no filesystem access during
// render, no fontkit.open() with a Buffer that doesn't quite fit, and
// the data URL string travels with the JS module wherever it ends up.
// We still need fs.readFileSync to succeed at module load: if Vercel
// didn't trace public/fonts into the bundle, the route falls back to
// Helvetica (Arabic will look wrong but the route returns 200).
const FONT_FAMILY = "ThmanyahSans";
const FONT_FALLBACK = "Helvetica";

function loadFontDataUrl(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), "public/fonts", filename),
    path.join(process.cwd(), "fonts", filename),
  ];
  for (const p of candidates) {
    try {
      const buf = fs.readFileSync(p);
      const mime = filename.toLowerCase().endsWith(".otf")
        ? "font/otf"
        : "font/ttf";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      // try next candidate
    }
  }
  console.warn(
    `[monthly-report-pdf] Font ${filename} not found in any candidate path; falling back to ${FONT_FALLBACK}`,
  );
  return null;
}

const regularSrc = loadFontDataUrl("ThmanyahSans-Regular.otf");
const boldSrc = loadFontDataUrl("ThmanyahSans-Bold.otf");
const FONT_LOADED = regularSrc !== null && boldSrc !== null;
if (FONT_LOADED) {
  // Register italic variants pointing back at the upright OTF — Thmanyah
  // doesn't ship a slanted cut, but @react-pdf throws "Could not resolve
  // font" the moment any style sets fontStyle: 'italic' on a family that
  // hasn't registered an italic source. The placeholder "empty" rows in
  // this report use italic, which was crashing the entire render.
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: regularSrc as string, fontWeight: 400, fontStyle: "normal" },
      { src: regularSrc as string, fontWeight: 400, fontStyle: "italic" },
      { src: boldSrc as string, fontWeight: 700, fontStyle: "normal" },
      { src: boldSrc as string, fontWeight: 700, fontStyle: "italic" },
    ],
  });
}
const ACTIVE_FONT = FONT_LOADED ? FONT_FAMILY : FONT_FALLBACK;

// Brand palette mirrors the email template in admin-notify.ts so the PDF
// feels like part of the same system.
const colors = {
  bg: "#0B0A0F",
  card: "#13121A",
  border: "#2A293A",
  gold: "#C9A84C",
  text: "#F0EDE6",
  muted: "#8A8697",
  good: "#7AB36F",
  bad: "#D86E6E",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.bg,
    color: colors.text,
    padding: 32,
    fontSize: 10,
    fontFamily: ACTIVE_FONT,
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  brand: { color: colors.gold, fontSize: 18, fontWeight: 700, letterSpacing: -0.5 },
  brandSub: { color: colors.muted, fontSize: 9, marginTop: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: 700, textAlign: "right" },
  titleSub: { color: colors.muted, fontSize: 9, textAlign: "right", marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  sectionHeading: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingBottom: 4,
  },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  balanceLabel: { color: colors.muted },
  balanceValue: { color: colors.text },
  balanceTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  balanceTotalLabel: { color: colors.text, fontWeight: 700 },
  balanceTotalValuePos: { color: colors.good, fontWeight: 700, fontSize: 12 },
  balanceTotalValueNeg: { color: colors.bad, fontWeight: 700, fontSize: 12 },
  balanceTotalValueZero: { color: colors.muted, fontWeight: 700, fontSize: 12 },
  tableHeader: {
    flexDirection: "row",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableHeaderCell: { color: colors.muted, fontSize: 8, fontWeight: 700 },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomColor: colors.border,
    borderBottomWidth: 0.5,
  },
  tableRowLast: { flexDirection: "row", paddingVertical: 3 },
  cell: { color: colors.text, fontSize: 9 },
  cellMuted: { color: colors.muted, fontSize: 9 },
  cellRight: { color: colors.text, fontSize: 9, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    marginTop: 6,
    paddingTop: 6,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  totalLabel: { color: colors.text, fontSize: 9, fontWeight: 700 },
  totalValue: { color: colors.gold, fontSize: 9, fontWeight: 700, textAlign: "right" },
  empty: { color: colors.muted, fontStyle: "italic", fontSize: 9 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    textAlign: "center",
    color: colors.muted,
    fontSize: 8,
  },
});

const fmt = (n: number) => `${formatCurrency(n)} ${CURRENCY.code}`;

function balanceColour(side: MonthlyReport["balance"]["side"]) {
  if (side === "company_owes_owner") return styles.balanceTotalValuePos;
  if (side === "owner_owes_company") return styles.balanceTotalValueNeg;
  return styles.balanceTotalValueZero;
}

function balanceCaption(report: MonthlyReport): string {
  const { side, balance } = report.balance;
  if (side === "company_owes_owner") return `Company owes ${report.ownerName}`;
  if (side === "owner_owes_company") return `${report.ownerName} owes company`;
  return "Settled";
  void balance;
}

function MonthlyReportDocument({ report }: { report: MonthlyReport }) {
  const b = report.balance.breakdown;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>MPIRE</Text>
            <Text style={styles.brandSub}>Property Management</Text>
          </View>
          <View>
            <Text style={styles.title}>Monthly Owner Report</Text>
            <Text style={styles.titleSub}>
              {report.monthLabel} · As of {report.asOf}
            </Text>
            <Text style={styles.titleSub}>Owner: {report.ownerName}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Owner Balance</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Opening balance ({report.balance.breakdown.openingBalance >= 0 ? "company owes owner" : "owner owes company"})</Text>
            <Text style={styles.balanceValue}>{fmt(b.openingBalance)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>+ Rent received to company</Text>
            <Text style={styles.balanceValue}>{fmt(b.rentReceivedToCompany)}</Text>
          </View>
          {/*
            Combine pass-through expenses with service charges (commission,
            BM fees, early-termination catch-up) into a single "Expenses &
            service charges" line. The detailed itemisation lives in the
            Charges & Expenses section below; here we only need the rolled-up
            number so the math from opening → current balance visibly
            reconciles. The label uses "−" because the bookkeeping subtracts
            this combined total from the owner's balance.
          */}
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>− Expenses &amp; service charges</Text>
            <Text style={styles.balanceValue}>
              {fmt(
                b.expensesCoveredByCompany +
                  b.commissionEarned +
                  b.earlyTerminationCommissionCatchUp +
                  b.businessManagerFees,
              )}
            </Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>− Settlements paid to owner</Text>
            <Text style={styles.balanceValue}>{fmt(b.settlementsPaidToOwner)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>+ Settlements received from owner</Text>
            <Text style={styles.balanceValue}>{fmt(b.settlementsReceivedFromOwner)}</Text>
          </View>
          <View style={styles.balanceTotal}>
            <Text style={styles.balanceTotalLabel}>Current balance — {balanceCaption(report)}</Text>
            <Text style={balanceColour(report.balance.side)}>{fmt(Math.abs(report.balance.balance))}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionHeading}>
            Defaulted Tenants · {report.defaultedInvoices.length} invoice{report.defaultedInvoices.length === 1 ? "" : "s"}
          </Text>
          {report.defaultedInvoices.length === 0 ? (
            <Text style={styles.empty}>No outstanding invoices. All tenants up to date.</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Tenant</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Property / Unit</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Due</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: "right" }]}>Days</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: "right" }]}>Owing</Text>
              </View>
              {report.defaultedInvoices.map((inv, i) => (
                <View
                  key={i}
                  style={
                    i === report.defaultedInvoices.length - 1
                      ? styles.tableRowLast
                      : styles.tableRow
                  }
                >
                  <Text style={[styles.cell, { flex: 2 }]}>{inv.tenantName}</Text>
                  <Text style={[styles.cellMuted, { flex: 2 }]}>
                    {inv.propertyName} — {inv.unitNumber}
                  </Text>
                  <Text style={[styles.cellMuted, { flex: 1 }]}>{inv.dueDate}</Text>
                  <Text style={[styles.cellRight, { flex: 0.7 }]}>{inv.daysOverdue}</Text>
                  <Text style={[styles.cellRight, { flex: 1.2 }]}>{fmt(inv.owing)}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { flex: 5.7 }]}>Total outstanding</Text>
                <Text style={[styles.totalValue, { flex: 1.2 }]}>{fmt(report.defaultedTotal)}</Text>
              </View>
            </>
          )}
        </View>

        {(() => {
          // Service charges are what the company is owed on top of pass-through
          // expenses. Surfacing them in the same section as the expense rows
          // gives the owner a single place to see every deduction this period.
          // Commission + BM fees are cumulative (they live on the balance
          // breakdown which is anchored on opening_balance_date), so they're
          // explicitly labelled to avoid confusion with the month-to-date
          // expense rows below.
          const charges: Array<{ label: string; amount: number }> = [];
          if (b.commissionEarned > 0) {
            charges.push({ label: "Commission earned (cumulative)", amount: b.commissionEarned });
          }
          if (b.earlyTerminationCommissionCatchUp > 0) {
            charges.push({ label: "Early-termination commission catch-up", amount: b.earlyTerminationCommissionCatchUp });
          }
          if (b.businessManagerFees > 0) {
            charges.push({ label: "Business manager fees (cumulative)", amount: b.businessManagerFees });
          }
          const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);
          const rowCount = charges.length + report.expenses.length;
          const grandTotal = chargesTotal + report.expensesTotal;
          return (
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>
                Expenses & Charges · {report.monthLabel} ({rowCount})
              </Text>
              {rowCount === 0 ? (
                <Text style={styles.empty}>No charges or expenses this period.</Text>
              ) : (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Date</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Category</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 2.5 }]}>Description</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Property</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Amount</Text>
                  </View>
                  {charges.map((c, i) => (
                    <View
                      key={`charge-${i}`}
                      style={
                        i === charges.length - 1 && report.expenses.length === 0
                          ? styles.tableRowLast
                          : styles.tableRow
                      }
                    >
                      <Text style={[styles.cellMuted, { flex: 1 }]}>—</Text>
                      <Text style={[styles.cell, { flex: 1.2 }]}>Service fee</Text>
                      <Text style={[styles.cell, { flex: 2.5 }]}>{c.label}</Text>
                      <Text style={[styles.cellMuted, { flex: 1.5 }]}>—</Text>
                      <Text style={[styles.cellRight, { flex: 1 }]}>{fmt(c.amount)}</Text>
                    </View>
                  ))}
                  {report.expenses.map((e, i) => (
                    <View
                      key={`exp-${i}`}
                      style={
                        i === report.expenses.length - 1
                          ? styles.tableRowLast
                          : styles.tableRow
                      }
                    >
                      <Text style={[styles.cellMuted, { flex: 1 }]}>{e.date}</Text>
                      <Text style={[styles.cell, { flex: 1.2 }]}>{e.category}</Text>
                      <Text style={[styles.cell, { flex: 2.5 }]}>
                        {e.description || "—"}
                        {e.vendor ? ` · ${e.vendor}` : ""}
                      </Text>
                      <Text style={[styles.cellMuted, { flex: 1.5 }]}>
                        {e.propertyName || "Owner-level"}
                      </Text>
                      <Text style={[styles.cellRight, { flex: 1 }]}>{fmt(e.amount)}</Text>
                    </View>
                  ))}
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { flex: 6.2 }]}>Total charges & expenses</Text>
                    <Text style={[styles.totalValue, { flex: 1 }]}>{fmt(grandTotal)}</Text>
                  </View>
                </>
              )}
            </View>
          );
        })()}

        <View style={styles.card}>
          <Text style={styles.sectionHeading}>
            Transfers to Owner · {report.transfersToOwner.length}
          </Text>
          {report.transfersToOwner.length === 0 ? (
            <Text style={styles.empty}>No transfers to owner this month.</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Date</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Method</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Reference</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Amount</Text>
              </View>
              {report.transfersToOwner.map((s, i) => (
                <View
                  key={i}
                  style={
                    i === report.transfersToOwner.length - 1
                      ? styles.tableRowLast
                      : styles.tableRow
                  }
                >
                  <Text style={[styles.cellMuted, { flex: 1 }]}>{s.date}</Text>
                  <Text style={[styles.cell, { flex: 1 }]}>{s.method}</Text>
                  <Text style={[styles.cellMuted, { flex: 2 }]}>{s.reference || "—"}</Text>
                  <Text style={[styles.cellRight, { flex: 1 }]}>{fmt(s.amount)}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { flex: 4 }]}>Total to owner</Text>
                <Text style={[styles.totalValue, { flex: 1 }]}>{fmt(report.transfersToOwnerTotal)}</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionHeading}>
            Transfers to Company · {report.transfersToCompany.length}
          </Text>
          {report.transfersToCompany.length === 0 ? (
            <Text style={styles.empty}>No transfers to company this month.</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Date</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Method</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Reference</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Amount</Text>
              </View>
              {report.transfersToCompany.map((s, i) => (
                <View
                  key={i}
                  style={
                    i === report.transfersToCompany.length - 1
                      ? styles.tableRowLast
                      : styles.tableRow
                  }
                >
                  <Text style={[styles.cellMuted, { flex: 1 }]}>{s.date}</Text>
                  <Text style={[styles.cell, { flex: 1 }]}>{s.method}</Text>
                  <Text style={[styles.cellMuted, { flex: 2 }]}>{s.reference || "—"}</Text>
                  <Text style={[styles.cellRight, { flex: 1 }]}>{fmt(s.amount)}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { flex: 4 }]}>Total to company</Text>
                <Text style={[styles.totalValue, { flex: 1 }]}>{fmt(report.transfersToCompanyTotal)}</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.footer} fixed>
          Generated {new Date(report.generatedAt).toUTCString()} · MPIRE Property Management
        </Text>
      </Page>
    </Document>
  );
}

export async function renderMonthlyReportPdf(report: MonthlyReport): Promise<Buffer> {
  const blob = await pdf(<MonthlyReportDocument report={report} />).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
