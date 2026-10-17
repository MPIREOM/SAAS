import { Document, Image, Page, Text, View, StyleSheet, Font, pdf } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";
import { agreementCopy, formatOmr, type AgreementCopy, type AgreementTermsInput } from "./terms";

// One A4 page on the Mpire letterhead, with the agreement in English (left)
// and Arabic (right) side by side, then the tenant's signature.
//
// Letterhead: public/letterhead/page.jpg is the full A4 letterhead (logo and
// company details at the top, contact strip at the bottom), drawn behind
// the page. The content is padded to sit between the two. Without the file
// a text letterhead is printed instead.

const FONT_FAMILY = "ThmanyahSans";
const FONT_FALLBACK = "Helvetica";

function readPublicFile(...parts: string[]): Buffer | null {
  for (const base of [path.join(process.cwd(), "public"), process.cwd()]) {
    try {
      return fs.readFileSync(path.join(base, ...parts));
    } catch {
      // try next candidate
    }
  }
  return null;
}

function fontDataUrl(filename: string): string | null {
  const buf = readPublicFile("fonts", filename);
  return buf ? `data:font/otf;base64,${buf.toString("base64")}` : null;
}

function imageDataUrl(filename: string): string | null {
  const buf = readPublicFile("letterhead", filename);
  const mime = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  return buf ? `data:${mime};base64,${buf.toString("base64")}` : null;
}

const regularSrc = fontDataUrl("ThmanyahSans-Regular.otf");
const boldSrc = fontDataUrl("ThmanyahSans-Bold.otf");
const FONT_LOADED = regularSrc !== null && boldSrc !== null;
if (FONT_LOADED) {
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: regularSrc as string, fontWeight: 400 },
      { src: boldSrc as string, fontWeight: 700 },
    ],
  });
} else {
  console.warn(`[agreement-pdf] Thmanyah fonts not found; falling back to ${FONT_FALLBACK} (Arabic will not render)`);
}
// No mid-word hyphenation ("per-mitted"); it also breaks Arabic words.
Font.registerHyphenationCallback((word) => [word]);
const ACTIVE_FONT = FONT_LOADED ? FONT_FAMILY : FONT_FALLBACK;

const LETTERHEAD = imageDataUrl("page.jpg");

const colors = {
  ink: "#1A1A1F",
  muted: "#6B6B76",
  rule: "#D9D4C7",
  gold: "#B08D3C",
  panel: "#F7F5EF",
};

const styles = StyleSheet.create({
  // With the letterhead, the content sits between its header band (to
  // ~101pt) and contact strip (from ~772pt).
  page: {
    fontFamily: ACTIVE_FONT,
    fontSize: 7.6,
    color: colors.ink,
    paddingTop: LETTERHEAD ? 100 : 0,
    paddingBottom: LETTERHEAD ? 72 : 54,
  },
  // Absolute boxes are sized against the padded content area, so give the
  // A4 size in points explicitly.
  letterhead: { position: "absolute", top: 0, left: 0, width: 595.28, height: 841.89 },
  textHeader: {
    marginHorizontal: 36,
    marginTop: 28,
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.gold,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontSize: 20, fontWeight: 700, color: colors.gold, letterSpacing: 1 },
  brandSub: { fontSize: 8.5, color: colors.muted, marginTop: 2 },
  brandAr: { fontSize: 11, fontWeight: 700, color: colors.ink, textAlign: "right" },
  body: { marginHorizontal: 36, marginTop: 6 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  title: { fontSize: 11.5, fontWeight: 700 },
  titleAr: { fontSize: 11.5, fontWeight: 700, textAlign: "right" },
  facts: {
    backgroundColor: colors.panel,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 6,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fact: { width: "33.33%", paddingVertical: 2, paddingHorizontal: 2 },
  factLabels: { flexDirection: "row", justifyContent: "space-between", color: colors.muted, fontSize: 6.8 },
  factValue: { fontWeight: 700, fontSize: 8.4, textAlign: "center", marginTop: 1 },
  columns: { flexDirection: "row", gap: 16 },
  column: { flex: 1 },
  intro: { marginBottom: 3, lineHeight: 0.7 },
  introAr: { marginBottom: 3, lineHeight: 0.7, textAlign: "right" },
  heading: { fontWeight: 700, color: colors.gold, marginTop: 3, marginBottom: 1, fontSize: 8.2 },
  headingAr: { fontWeight: 700, color: colors.gold, marginTop: 3, marginBottom: 1, fontSize: 8.2, textAlign: "right" },
  clause: { flexDirection: "row", marginBottom: 1 },
  clauseNum: { width: 20, color: colors.muted },
  clauseText: { flex: 1, lineHeight: 0.7 },
  clauseAr: { flexDirection: "row-reverse", marginBottom: 1 },
  clauseNumAr: { width: 20, color: colors.muted, textAlign: "right" },
  clauseTextAr: { flex: 1, lineHeight: 0.75, textAlign: "right" },
  signatureBlock: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sigCol: { width: "48%" },
  sigLabelRow: { flexDirection: "row", justifyContent: "space-between", color: colors.muted, marginBottom: 2 },
  sigBox: {
    height: 34,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sigImage: { height: 31, objectFit: "contain" },
  sigValue: { fontSize: 10, fontWeight: 700, textAlign: "center", paddingBottom: 4 },
  audit: { marginTop: 3, fontSize: 6.5, color: colors.muted, alignItems: "center", gap: 1 },
  textFooter: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    borderTopWidth: 0.75,
    borderTopColor: colors.rule,
    paddingTop: 6,
    fontSize: 7,
    color: colors.muted,
    textAlign: "center",
  },
});

export interface AgreementPdfData extends AgreementTermsInput {
  reference: string;
  tenantName: string;
  nationalId: string | null;
  propertyName: string;
  unitNumber: string;
  leaseStart: string | null;
  /** OMR; null when the lease has none. */
  securityDeposit: number | null;
  electricityMeter: string | null;
  waterMeter: string | null;
  /** Present once signed. */
  signed?: {
    signerName: string;
    signatureImage: string;
    signedAt: string;
    ip: string | null;
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+04:00` : iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Muscat" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Muscat",
    timeZoneName: "short",
  });
}

function Clauses({ copy, rtl }: { copy: AgreementCopy; rtl: boolean }) {
  return (
    <View style={styles.column}>
      <Text style={rtl ? styles.introAr : styles.intro}>{copy.intro}</Text>
      {copy.sections.map((section) => (
        <View key={section.heading} wrap={false}>
          <Text style={rtl ? styles.headingAr : styles.heading}>{section.heading}</Text>
          {section.clauses.map((c) => (
            <View key={c.number} style={rtl ? styles.clauseAr : styles.clause}>
              <Text style={rtl ? styles.clauseNumAr : styles.clauseNum}>{c.number}</Text>
              <Text style={rtl ? styles.clauseTextAr : styles.clauseText}>{c.text}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Arabic as react-pdf can draw it with Thmanyah: vowel marks (tanween,
 * damma, shadda, ...) are misplaced onto neighbouring letters, and a full
 * stop or colon ending a paragraph lands at the start of its last line, so
 * both are dropped. The web page keeps the original text.
 */
function pdfArabic(text: string): string {
  return text.replace(/[\u064B-\u0652\u0670]/g, "").replace(/[.:]\s*$/, "");
}

function arabicCopyForPdf(copy: AgreementCopy): AgreementCopy {
  return {
    ...copy,
    title: pdfArabic(copy.title),
    intro: pdfArabic(copy.intro),
    fields: Object.fromEntries(
      Object.entries(copy.fields).map(([k, v]) => [k, pdfArabic(v)])
    ) as AgreementCopy["fields"],
    sections: copy.sections.map((section) => ({
      heading: pdfArabic(section.heading),
      clauses: section.clauses.map((c) => ({ ...c, text: pdfArabic(c.text) })),
    })),
    signature: pdfArabic(copy.signature),
    date: pdfArabic(copy.date),
    signedElectronically: pdfArabic(copy.signedElectronically),
  };
}

export function AgreementDocument({ data }: { data: AgreementPdfData }) {
  const en = agreementCopy("en", data);
  const ar = arabicCopyForPdf(agreementCopy("ar", data));
  const facts: [string, string, string][] = [
    [en.fields.tenantName, data.tenantName, ar.fields.tenantName],
    [en.fields.nationalId, data.nationalId || "—", ar.fields.nationalId],
    [en.fields.unit, `${data.propertyName} — ${data.unitNumber}`, ar.fields.unit],
    [en.fields.leaseStart, formatDate(data.leaseStart), ar.fields.leaseStart],
    [en.fields.securityDeposit, data.securityDeposit ? formatOmr(data.securityDeposit, "en") : "—", ar.fields.securityDeposit],
    [en.fields.gateKeys, String(data.gateKeys), ar.fields.gateKeys],
    [en.fields.electricityMeter, data.electricityMeter || "—", ar.fields.electricityMeter],
    [en.fields.waterMeter, data.waterMeter || "—", ar.fields.waterMeter],
    [en.fields.reference, data.reference, ar.fields.reference],
  ];

  return (
    <Document title={`${en.title} — ${data.reference}`} author="MPIRE Property Management">
      <Page size="A4" style={styles.page}>
        {LETTERHEAD ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
          <Image src={LETTERHEAD} style={styles.letterhead} fixed />
        ) : (
          <View style={styles.textHeader} fixed>
            <View>
              <Text style={styles.brand}>MPIRE</Text>
              <Text style={styles.brandSub}>Property Management · Sultanate of Oman</Text>
            </View>
            <Text style={styles.brandAr}>MPIRE لإدارة العقارات</Text>
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{en.title}</Text>
            <Text style={styles.titleAr}>{ar.title}</Text>
          </View>

          <View style={styles.facts}>
            {facts.map(([labelEn, value, labelAr]) => (
              <View key={labelEn} style={styles.fact}>
                <View style={styles.factLabels}>
                  <Text>{labelEn}</Text>
                  <Text>{labelAr}</Text>
                </View>
                <Text style={styles.factValue}>{value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.columns}>
            <Clauses copy={en} rtl={false} />
            <Clauses copy={ar} rtl />
          </View>

          <View style={styles.signatureBlock} wrap={false}>
            <View style={styles.sigCol}>
              <View style={styles.sigLabelRow}>
                <Text>{en.signature}</Text>
                <Text>{ar.signature}</Text>
              </View>
              <View style={styles.sigBox}>
                {data.signed ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                  <Image src={data.signed.signatureImage} style={styles.sigImage} />
                ) : null}
              </View>
              {data.signed ? <Text style={[styles.sigValue, { marginTop: 3 }]}>{data.signed.signerName}</Text> : null}
            </View>
            <View style={styles.sigCol}>
              <View style={styles.sigLabelRow}>
                <Text>{en.date}</Text>
                <Text>{ar.date}</Text>
              </View>
              <View style={styles.sigBox}>
                {data.signed ? <Text style={styles.sigValue}>{formatDate(data.signed.signedAt)}</Text> : null}
              </View>
              {data.signed ? (
                // Under the date, level with the signer's name. Arabic and
                // Latin in separate Text runs: mixed in one run the bidi
                // reordering scrambles the date.
                <View style={styles.audit}>
                  <Text>
                    {`${en.signedElectronically} · ${formatDateTime(data.signed.signedAt)}${
                      data.signed.ip ? ` · IP ${data.signed.ip}` : ""
                    }`}
                  </Text>
                  <Text>{`${ar.signedElectronically} · ${data.reference}`}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {!LETTERHEAD && (
          <Text style={styles.textFooter} fixed>
            MPIRE Property Management · Sultanate of Oman
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderAgreementPdf(data: AgreementPdfData): Promise<Buffer> {
  const blob = await pdf(<AgreementDocument data={data} />).toBlob();
  return Buffer.from(await blob.arrayBuffer());
}
