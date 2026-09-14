"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Link2, RefreshCw, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { TemplateCreateOutcome, WhatsAppSetupStatus } from "@/lib/whatsapp/setup";

type BadgeVariant = "success" | "destructive" | "warning" | "default";
type ActionKind = "webhooks" | "templates" | "register" | "request-code" | "verify-code";

function statusVariant(status: string | null): BadgeVariant {
  if (!status) return "warning";
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "CONNECTED" || s === "GREEN" || s === "HIGH") return "success";
  if (s === "REJECTED" || s === "BANNED" || s === "DISABLED" || s === "RED" || s === "LOW" || s === "RESTRICTED") return "destructive";
  return "warning";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-surface p-5 animate-fade-in-up">
      <h2 className="text-base font-semibold text-text-primary font-display">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-2 last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="flex flex-wrap items-center gap-2 text-sm text-text-primary">{children}</span>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs ltr-nums break-all">{children}</span>;
}

export function WhatsAppSetupPanel() {
  const t = useTranslations("settings");
  const [status, setStatus] = useState<WhatsAppSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<{ variant: "success" | "destructive"; text: string } | null>(null);
  const [outcomes, setOutcomes] = useState<TemplateCreateOutcome[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/setup", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus((await res.json()) as WhatsAppSetupStatus);
    } catch {
      setError(t("setupLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(kind: ActionKind, payload?: Record<string, string>) {
    setBusy(kind);
    setNotice(null);
    try {
      const body =
        kind === "register" ? { pin } : kind === "verify-code" ? { code } : payload;
      const res = await fetch(`/api/whatsapp/setup/${kind}`, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ variant: "destructive", text: data.error || t("setupActionFailed") });
        return;
      }
      if (kind === "templates") setOutcomes((data.results as TemplateCreateOutcome[]) ?? []);
      if (kind === "register") setPin("");
      if (kind === "verify-code") setCode("");
      setNotice({ variant: "success", text: t("setupDone") });
      await load();
    } catch {
      setNotice({ variant: "destructive", text: t("setupActionFailed") });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !status) return <Spinner label={t("setupLoading")} className="py-12" />;
  if (error && !status) return <Alert variant="destructive">{error}</Alert>;
  if (!status) return null;

  const requiredMissing = status.env.filter((e) => e.required && !e.set);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void load()} loading={loading}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {t("setupRefresh")}
        </Button>
        <Button
          size="sm"
          onClick={() => void runAction("webhooks")}
          loading={busy === "webhooks"}
          disabled={busy !== null || requiredMissing.length > 0}
        >
          <Link2 aria-hidden="true" className="h-4 w-4" />
          {t("setupConnectWebhooks")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void runAction("templates")}
          loading={busy === "templates"}
          disabled={busy !== null || !status.wabaId}
        >
          {t("setupCreateTemplates")}
        </Button>
      </div>

      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      {/* Environment */}
      <Section title={t("setupEnvironment")}>
        {status.env.map((e) => (
          <Row key={e.name} label={e.name}>
            {e.set ? (
              <Badge variant="success">{t("setupSet")}</Badge>
            ) : (
              <Badge variant={e.required ? "destructive" : "default"}>
                {e.required ? t("setupNotSet") : t("setupOptional")}
              </Badge>
            )}
          </Row>
        ))}
        <Row label={t("setupCallback")}>
          <Mono>{status.callbackUrl ?? "—"}</Mono>
        </Row>
      </Section>

      {/* Token */}
      <Section title={t("setupToken")}>
        {status.tokenError ? (
          <Alert variant="destructive">{status.tokenError}</Alert>
        ) : status.token ? (
          <>
            <Row label={t("setupTokenValid")}>
              <Badge variant={status.token.isValid ? "success" : "destructive"}>
                {status.token.isValid ? t("setupYes") : t("setupNo")}
              </Badge>
              <span className="text-xs text-text-secondary">{status.token.type ?? ""}</span>
            </Row>
            <Row label={t("setupExpires")}>
              <Mono>
                {status.token.expiresAt === 0 || status.token.expiresAt === null
                  ? t("setupNeverExpires")
                  : new Date(status.token.expiresAt * 1000).toLocaleString()}
              </Mono>
            </Row>
            <Row label="App ID">
              <Mono>{status.token.appId ?? "—"}</Mono>
            </Row>
            <Row label={t("setupScopes")}>
              <Mono>{status.token.scopes.join(", ") || "—"}</Mono>
            </Row>
          </>
        ) : null}
      </Section>

      {/* Phone number */}
      <Section title={t("setupPhone")}>
        {status.phoneError ? (
          <Alert variant="destructive">{status.phoneError}</Alert>
        ) : status.phone ? (
          <>
            <Row label={t("setupNumber")}>
              <Mono>{status.phone.displayPhoneNumber ?? status.phone.id}</Mono>
              <span className="text-xs text-text-secondary">{status.phone.verifiedName ?? ""}</span>
            </Row>
            <Row label={t("setupStatus")}>
              <Badge variant={statusVariant(status.phone.status)}>{status.phone.status ?? "—"}</Badge>
            </Row>
            <Row label={t("setupQuality")}>
              <Badge variant={statusVariant(status.phone.qualityRating)}>{status.phone.qualityRating ?? "—"}</Badge>
              {status.phone.messagingLimit && <Mono>{status.phone.messagingLimit}</Mono>}
            </Row>
            <Row label={t("setupPlatform")}>
              <Mono>{status.phone.platformType ?? "—"}</Mono>
              {status.phone.nameStatus && <Badge variant={statusVariant(status.phone.nameStatus)}>{status.phone.nameStatus}</Badge>}
            </Row>
            <Row label={t("setupOwnership")}>
              <Badge variant={status.phone.codeVerificationStatus === "VERIFIED" ? "success" : "warning"}>
                {status.phone.codeVerificationStatus ?? "—"}
              </Badge>
            </Row>
            {status.phone.codeVerificationStatus !== "VERIFIED" && (
              <div className="space-y-2 pt-3">
                <p className="text-sm text-text-secondary">{t("setupVerifyHint")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void runAction("request-code", { method: "SMS" })}
                    loading={busy === "request-code"}
                    disabled={busy !== null}
                  >
                    {t("setupSendSms")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void runAction("request-code", { method: "VOICE" })}
                    loading={busy === "request-code"}
                    disabled={busy !== null}
                  >
                    {t("setupSendCall")}
                  </Button>
                </div>
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runAction("verify-code");
                  }}
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="123456"
                    aria-label={t("setupCode")}
                    className="h-9 w-32 font-mono ltr-nums"
                  />
                  <Button type="submit" size="sm" loading={busy === "verify-code"} disabled={busy !== null || code.length < 4}>
                    {t("setupVerify")}
                  </Button>
                </form>
              </div>
            )}
            {status.phone.status !== "CONNECTED" && (
              <div className="space-y-2 pt-3">
                <p className="text-sm text-text-secondary">{t("setupRegisterHint")}</p>
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runAction("register");
                  }}
                >
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    autoComplete="off"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    aria-label={t("setupPin")}
                    className="h-9 w-32 font-mono ltr-nums"
                  />
                  <Button type="submit" size="sm" loading={busy === "register"} disabled={busy !== null || pin.length !== 6}>
                    {t("setupRegister")}
                  </Button>
                </form>
              </div>
            )}
          </>
        ) : null}
      </Section>

      {/* Account + webhooks */}
      <Section title={t("setupWebhooks")}>
        <Row label={t("setupAccount")}>
          <Mono>{status.wabaId ?? "—"}</Mono>
          {!status.wabaId && <span className="text-xs text-text-secondary">{status.wabaNotes.join("; ")}</span>}
        </Row>
        <Row label={t("setupAppSubscribed")}>
          {status.subscribedAppsError ? (
            <span className="text-xs text-destructive">{status.subscribedAppsError}</span>
          ) : (
            <Badge variant={status.appSubscribedToWaba ? "success" : "destructive"}>
              {status.appSubscribedToWaba ? t("setupYes") : t("setupNo")}
            </Badge>
          )}
        </Row>
        <Row label={t("setupCallback")}>
          {status.appSubscriptionError ? (
            <span className="text-xs text-destructive">{status.appSubscriptionError}</span>
          ) : (
            <Mono>{status.appSubscription?.callbackUrl ?? "—"}</Mono>
          )}
        </Row>
        <Row label={t("setupFields")}>
          <Mono>{status.appSubscription?.fields.join(", ") || "—"}</Mono>
          {status.missingFields.length > 0 && status.appSubscription && (
            <span className="text-xs text-warning">{t("setupMissing")}: {status.missingFields.join(", ")}</span>
          )}
        </Row>
        <div className="pt-2">
          {status.webhookPointsHere && status.appSubscribedToWaba ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              {t("setupPointsHere")}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-warning">
              <XCircle aria-hidden="true" className="h-4 w-4" />
              {t("setupNotPointingHere")}
            </p>
          )}
        </div>
      </Section>

      {/* Templates */}
      <Section title={t("setupTemplates")}>
        {status.templatesError && <Alert variant="warning">{status.templatesError}</Alert>}
        <ul className="divide-y divide-border/40">
          {status.templates.map((tpl) => {
            const outcome = outcomes.find((o) => o.name === tpl.name && o.language === tpl.language);
            return (
              <li key={`${tpl.name}:${tpl.language}`} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Mono>{tpl.name}</Mono>
                  <span className="text-xs text-text-secondary">{tpl.language} · {tpl.category}</span>
                  <Badge variant={statusVariant(tpl.status)}>{tpl.status ?? t("setupMissing")}</Badge>
                  {tpl.manual && !tpl.status && <Badge variant="warning">{t("setupManualTemplate")}</Badge>}
                  {outcome && (
                    <span className={`text-xs ${outcome.action === "failed" ? "text-destructive" : "text-text-secondary"}`}>
                      {outcome.action}
                      {outcome.error ? `: ${outcome.error}` : ""}
                    </span>
                  )}
                </div>
                {tpl.rejectedReason && <p className="text-xs text-destructive">{tpl.rejectedReason}</p>}
                {tpl.issues.length > 0 && <p className="text-xs text-warning">{tpl.issues.join("; ")}</p>}
                {tpl.manual && !tpl.status && <p className="text-xs text-text-secondary">{tpl.manual}</p>}
                <details>
                  <summary className="cursor-pointer text-xs text-text-secondary">{t("setupBody")}</summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-elevated p-3 text-xs text-text-primary">{tpl.bodyPreview}</pre>
                </details>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
