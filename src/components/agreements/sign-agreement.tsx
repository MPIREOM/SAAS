"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Download, Eraser, FileSignature } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agreementCopy, formatOmr, type AgreementLang } from "@/lib/agreements/terms";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { buttonVariants } from "@/components/ui/button";

// The tenant's private signing page (linked from WhatsApp / email). Shows
// the agreement in the page language, takes a drawn signature, and offers
// the signed bilingual PDF afterwards.

interface AgreementData {
  reference: string;
  status: "pending" | "signed";
  tenant_name: string;
  national_id: string | null;
  unit_number: string;
  property_name: string;
  lease_start: string | null;
  security_deposit: number | null;
  electricity_meter: string | null;
  water_meter: string | null;
  gate_keys: number;
  garbage_fee: number;
  key_fee: number;
  signed_at: string | null;
  signer_name: string | null;
}

type LoadState = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; data: AgreementData };

const ERROR_KEYS: Record<string, string> = {
  already_signed: "errors.alreadySigned",
  invalid_signature: "errors.signatureRequired",
};

async function fetchAgreement(url: string): Promise<LoadState> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { kind: "invalid" };
    return { kind: "ready", data: (await res.json()) as AgreementData };
  } catch {
    return { kind: "invalid" };
  }
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+04:00` : iso);
  return d.toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Muscat",
  });
}

export function SignAgreement({ token, locale }: { token: string; locale: string }) {
  const t = useTranslations("tenantAgreement");
  const tc = useTranslations("common");
  const lang: AgreementLang = locale === "ar" ? "ar" : "en";
  const url = `/api/tenant-agreement/${encodeURIComponent(token)}`;

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pad = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAgreement(url).then((next) => {
      if (cancelled) return;
      setState(next);
      if (next.kind === "ready") setName(next.data.tenant_name);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const onInk = useCallback((ink: boolean) => setHasInk(ink), []);

  const submit = async () => {
    setError("");
    if (name.trim().length < 2) return setError(t("errors.nameRequired"));
    const signature = pad.current?.toDataUrl();
    if (!signature) return setError(t("errors.signatureRequired"));
    if (!accepted) return setError(t("errors.acceptRequired"));
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer_name: name.trim(), signature, accepted: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(t(ERROR_KEYS[body.error] ?? "errors.generic"));
        if (body.error === "already_signed") setState(await fetchAgreement(url));
      } else {
        setState(await fetchAgreement(url));
      }
    } catch {
      setError(t("errors.generic"));
    }
    setBusy(false);
  };

  if (state.kind === "loading") {
    return (
      <Shell title={t("title")}>
        <p className="text-sm text-text-secondary" role="status">
          {tc("loading")}
        </p>
      </Shell>
    );
  }
  if (state.kind === "invalid") {
    return (
      <Shell title={t("title")}>
        <Alert variant="destructive">{t("invalidLink")}</Alert>
      </Shell>
    );
  }

  const { data } = state;
  const copy = agreementCopy(lang, { gateKeys: data.gate_keys, garbageFee: data.garbage_fee, keyFee: data.key_fee });
  const otherLocale = lang === "ar" ? "en" : "ar";
  const facts: [string, string, boolean][] = [
    [copy.fields.tenantName, data.tenant_name, false],
    [copy.fields.nationalId, data.national_id || "—", true],
    [copy.fields.unit, `${data.property_name} — ${data.unit_number}`, false],
    [copy.fields.leaseStart, formatDate(data.lease_start, locale), false],
    [copy.fields.securityDeposit, data.security_deposit ? formatOmr(data.security_deposit, lang) : "—", true],
    [copy.fields.electricityMeter, data.electricity_meter || "—", true],
    [copy.fields.waterMeter, data.water_meter || "—", true],
    [copy.fields.gateKeys, String(data.gate_keys), true],
    [copy.fields.reference, data.reference, true],
  ];

  return (
    <Shell
      title={copy.title}
      subtitle={`${data.property_name} · ${data.unit_number}`}
      action={
        <Link
          href={`/${otherLocale}/tenant-agreement/${encodeURIComponent(token)}`}
          className="text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
          lang={otherLocale}
        >
          {t("switchLanguage")}
        </Link>
      }
    >
      <section className="bg-surface border border-border rounded-xl shadow-card p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(([label, value, mono]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[12.5px] font-medium text-text-secondary">{label}</dt>
              <dd className={`mt-0.5 text-sm font-medium text-text-primary ${mono ? "tabular-nums ltr-nums" : ""}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="text-sm text-text-primary leading-relaxed">{copy.intro}</p>
        {copy.sections.map((section) => (
          <div key={section.heading} className="space-y-2">
            <h2 className="text-sm font-semibold text-accent">{section.heading}</h2>
            <ol className="space-y-2">
              {section.clauses.map((c) => (
                <li key={c.number} className="flex gap-3 text-sm text-text-primary leading-relaxed">
                  <span className="tabular-nums ltr-nums text-text-secondary shrink-0">{c.number}</span>
                  <span>{c.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
        <p className="text-xs text-text-secondary">{t("bilingualNote")}</p>
      </section>

      {data.status === "signed" ? (
        <section className="bg-surface border border-success/30 rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="h-6 w-6 text-success shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-text-primary font-display">{t("signedTitle")}</h2>
              <p className="text-sm text-text-secondary mt-1">
                {t("signedBy", { name: data.signer_name ?? data.tenant_name, date: formatDate(data.signed_at, locale) })}
              </p>
            </div>
          </div>
          <a
            href={`${url}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants()}
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            {t("downloadCopy")}
          </a>
        </section>
      ) : (
        <section className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
          <h2 className="text-base font-semibold text-text-primary font-display">{t("signHeading")}</h2>
          <Input label={t("fullName")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{copy.signature}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => pad.current?.clear()} disabled={!hasInk}>
                <Eraser aria-hidden="true" className="h-3.5 w-3.5" />
                {t("clear")}
              </Button>
            </div>
            <SignaturePad ref={pad} label={t("signatureArea")} onChange={onInk} />
            <p className="text-xs text-text-secondary">{t("signHint")}</p>
          </div>
          <label className="flex items-start gap-3 text-sm text-text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <span>{t("accept")}</span>
          </label>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button type="button" size="lg" onClick={submit} loading={busy} className="w-full sm:w-auto">
            <FileSignature aria-hidden="true" className="h-4 w-4" />
            {t("submit")}
          </Button>
        </section>
      )}
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-[15px] font-bold text-accent-foreground"
          >
            M
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-bold text-text-primary font-display truncate">{title}</h1>
            {subtitle && <p className="text-xs text-text-secondary truncate">{subtitle}</p>}
          </div>
          {action}
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {children}
        <footer className="text-center py-2">
          <p className="text-xs text-text-tertiary">MPIRE Property Management</p>
        </footer>
      </main>
    </div>
  );
}
