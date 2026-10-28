"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Landmark, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CURRENCY, formatAmount } from "@/lib/currency";

interface MandateView {
  id: string;
  status: string;
  amount: number;
  currency: string;
  collectionDay: number;
  debtorAccountMasked: string | null;
  tenantName: string;
  propertyName: string | null;
  unitNumber: string | null;
  otpExpiresAt: string | null;
  attemptsLeft: number;
}

// Tenant-facing page reached from the WhatsApp link. The tenant reads the
// mandate summary, types the OTP their bank sent by SMS, and we confirm it
// with the bank. Nothing here needs a login; the token in the URL is the
// credential and the server caps attempts.
export default function EMandateOtpPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const t = useTranslations("eMandates.portal");
  const tc = useTranslations("common");
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<MandateView | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { token: tk } = await params;
      try {
        const res = await fetch("/api/tenant-portal/e-mandate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tk }),
        });
        const data = (await res.json().catch(() => ({}))) as MandateView & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setInvalid(data.error || "invalid");
        } else {
          setToken(tk);
          setView(data);
          if (data.status === "active") setDone(true);
        }
      } catch {
        if (!cancelled) setInvalid("invalid");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/tenant-portal/e-mandate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, otp }),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (!res.ok) {
        setError(data.error || t("otpFailed"));
        if (res.status === 423 || res.status === 410) setView((v) => (v ? { ...v, attemptsLeft: 0 } : v));
        else setView((v) => (v ? { ...v, attemptsLeft: Math.max(0, v.attemptsLeft - 1) } : v));
        return;
      }
      if (data.status === "active") setDone(true);
      else setError(t("stillPending"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-4">
        <Spinner label={tc("loading")} sizeClassName="h-8 w-8" />
      </div>
    );
  }

  if (invalid || !view) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-destructive-tint border border-destructive/30">
            <AlertTriangle aria-hidden="true" className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary font-display">{t("invalidTitle")}</h1>
          <Alert variant="destructive" className="text-start">{t("invalidMessage")}</Alert>
        </div>
      </div>
    );
  }

  const money = `${formatAmount(view.amount)} ${CURRENCY.code}`;
  const locked = view.attemptsLeft <= 0 && !done;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-[15px] font-bold text-accent-foreground"
          >
            M
          </span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-text-primary font-display truncate">{t("title")}</h1>
            <p className="text-xs text-text-secondary truncate">{t("subtitle")}</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <section className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-accent-tint border border-accent/30 flex items-center justify-center shrink-0">
              <Landmark aria-hidden="true" className="h-6 w-6 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-text-primary font-display truncate">{view.tenantName}</h2>
              <p className="text-xs text-text-secondary truncate">
                {[view.propertyName, view.unitNumber ? `${t("unit")} ${view.unitNumber}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-[12.5px] font-medium text-text-secondary">{t("amount")}</dt>
              <dd className="text-text-primary tabular-nums ltr-nums mt-1">{money}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-medium text-text-secondary">{t("collectionDay")}</dt>
              <dd className="text-text-primary tabular-nums ltr-nums mt-1">{t("dayOfMonth", { day: view.collectionDay })}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[12.5px] font-medium text-text-secondary">{t("account")}</dt>
              <dd className="text-text-primary tabular-nums ltr-nums mt-1">{view.debtorAccountMasked ?? "—"}</dd>
            </div>
          </dl>
        </section>

        {done ? (
          <Alert variant="success" title={t("doneTitle")}>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              {t("doneMessage")}
            </span>
          </Alert>
        ) : locked ? (
          <Alert variant="destructive" title={t("lockedTitle")}>{t("lockedMessage")}</Alert>
        ) : (
          <form onSubmit={submit} className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
            <p className="text-sm text-text-secondary">{t("otpInstructions")}</p>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Input
              label={t("otpLabel")}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              className="tabular-nums ltr-nums text-lg tracking-[0.3em] text-center"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              helperText={t("attemptsLeft", { count: view.attemptsLeft })}
              required
            />
            <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={otp.length < 4}>
              {t("confirm")}
            </Button>
            <p className="text-xs text-text-secondary">{t("consent", { amount: money, day: view.collectionDay })}</p>
          </form>
        )}

        <p className="text-xs text-text-tertiary text-center pt-2">MPIRE Property Management</p>
      </main>
    </div>
  );
}
