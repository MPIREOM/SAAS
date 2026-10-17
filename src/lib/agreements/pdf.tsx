import { Document, Image, Page, Text, View, StyleSheet, Font, pdf } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";
import { agreementCopy, type AgreementCopy, type AgreementTermsInput } from "./terms";

// One A4 page: Mpire letterhead, then the agreement in English (left) and
// Arabic (right) side by side, then the tenant's signature.
//
// Letterhead: drop the letterhead artwork into public/letterhead/ as
// header.png (full-width banner) and optionally footer.png; they are used
// when present. Without them a text letterhead is printed instead.

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
  return buf ? `data:image/png;base64,${buf.toString("base64")}` : null;
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

const HEADER_IMAGE = imageDataUrl("header.png");
const FOOTER_IMAGE = imageDataUrl("footer.png");

const colors = {
  ink: "#1A1A1F",
  muted: "#6B6B76",
  rule: "#D9D4C7",
  gold: "#B08D3C",
  panel: "#F7F5EF",
};

const styles = StyleSheet.create({
  page: { fontFamily: ACTIVE_FONT, fontSize: 8.6, color: colors.ink, paddingBottom: 54 },
  headerImage: { width: "100%" },
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
  body: { marginHorizontal: 36, marginTop: 14 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 12.5, fontWeight: 700 },
  titleAr: { fontSize: 12.5, fontWeight: 700, textAlign: "right" },
  facts: {
    backgroundColor: colors.panel,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  factRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  factLabelEn: { width: "26%", color: colors.muted },
  factValue: { width: "48%", fontWeight: 700, textAlign: "center" },
  factLabelAr: { width: "26%", color: colors.muted, textAlign: "right" },
  columns: { flexDirection: "row", gap: 16 },
  column: { flex: 1 },
  intro: { marginBottom: 6, lineHeight: 0.9 },
  introAr: { marginBottom: 6, lineHeight: 0.9, textAlign: "right" },
  heading: { fontWeight: 700, color: colors.gold, marginTop: 6, marginBottom: 3, fontSize: 9.2 },
  headingAr: { fontWeight: 700, color: colors.gold, marginTop: 6, marginBottom: 3, fontSize: 9.2, textAlign: "right" },
  clause: { flexDirection: "row", marginBottom: 3 },
  clauseNum: { width: 20, color: colors.muted },
  clauseText: { flex: 1, lineHeight: 0.9 },
  clauseAr: { flexDirection: "row-reverse", marginBottom: 3 },
  clauseNumAr: { width: 20, color: colors.muted, textAlign: "right" },
  clauseTextAr: { flex: 1, lineHeight: 0.95, textAlign: "right" },
  signatureBlock: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sigCol: { width: "48%" },
  sigLabelRow: { flexDirection: "row", justifyContent: "space-between", color: colors.muted, marginBottom: 4 },
  sigBox: {
    height: 62,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sigImage: { height: 56, objectFit: "contain" },
  sigValue: { fontSize: 10, fontWeight: 700, textAlign: "center", paddingBottom: 4 },
  audit: { marginTop: 8, fontSize: 7, color: colors.muted, alignItems: "center", gap: 2 },
  footerImage: { position: "absolute", bottom: 0, left: 0, right: 0, width: "100%" },
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

export function AgreementDocument({ data }: { data: AgreementPdfData }) {
  const en = agreementCopy("en", data);
  const ar = agreementCopy("ar", data);
  const facts: [string, string, string][] = [
    [en.fields.tenantName, data.tenantName, ar.fields.tenantName],
    [en.fields.nationalId, data.nationalId || "—", ar.fields.nationalId],
    [en.fields.unit, `${data.propertyName} — ${data.unitNumber}`, ar.fields.unit],
    [en.fields.leaseStart, formatDate(data.leaseStart), ar.fields.leaseStart],
    [en.fields.gateKeys, String(data.gateKeys), ar.fields.gateKeys],
    [en.fields.reference, data.reference, ar.fields.reference],
  ];

  return (
    <Document title={`${en.title} — ${data.reference}`} author="MPIRE Property Management">
      <Page size="A4" style={styles.page}>
        {HEADER_IMAGE ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
          <Image src={HEADER_IMAGE} style={styles.headerImage} fixed />
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
              <View key={labelEn} style={styles.factRow}>
                <Text style={styles.factLabelEn}>{labelEn}</Text>
                <Text style={styles.factValue}>{value}</Text>
                <Text style={styles.factLabelAr}>{labelAr}</Text>
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
            </View>
          </View>

          {data.signed ? (
            // Arabic and Latin on separate lines: mixed in one line the
            // bidi reordering scrambles the date.
            <View style={styles.audit}>
              <Text>
                {`${en.signedElectronically} · ${formatDateTime(data.signed.signedAt)}${
                  data.signed.ip ? ` · IP ${data.signed.ip}` : ""
                } · ${data.reference}`}
              </Text>
              <Text>{ar.signedElectronically}</Text>
            </View>
          ) : null}
        </View>

        {FOOTER_IMAGE ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
          <Image src={FOOTER_IMAGE} style={styles.footerImage} fixed />
        ) : (
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
