"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ExternalLink, HardHat, Link2Off, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const subscribeNoop = () => () => {};

/** Create / copy / replace / turn off the read-only contractor schedule link (048). */
export function ContractorLink({
  campaignId,
  locale,
  initialToken,
}: {
  campaignId: string;
  locale: string;
  initialToken: string | null;
}) {
  const t = useTranslations("visits");
  const { toast } = useToast();
  const origin = useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "");
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState<"create" | "replace" | "off" | null>(null);
  const [copied, setCopied] = useState(false);

  const link = token && origin ? `${origin}/${locale}/visit-schedule/${token}` : "";
  const url = `/api/visits/campaigns/${campaignId}/crew-link`;

  const create = async (regenerate: boolean) => {
    setBusy(regenerate ? "replace" : "create");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.crew_token) {
        setToken(body.crew_token);
        if (regenerate) toast({ title: t("crewReplaced"), variant: "success" });
      } else {
        toast({ title: t("errors.generic"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("errors.generic"), variant: "destructive" });
    }
    setBusy(null);
  };

  const turnOff = async () => {
    setBusy("off");
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        setToken(null);
        toast({ title: t("crewTurnedOff"), variant: "success" });
      } else {
        toast({ title: t("errors.generic"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("errors.generic"), variant: "destructive" });
    }
    setBusy(null);
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2 border-t border-border/40 pt-4">
      <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <HardHat aria-hidden="true" className="h-4 w-4 text-accent" />
        {t("crewLink")}
      </p>
      {token ? (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              readOnly
              value={link}
              aria-label={t("crewLink")}
              className="font-mono text-xs ltr-nums"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="secondary" onClick={copy} disabled={!link}>
                {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                {copied ? t("copied") : t("copy")}
              </Button>
              <a
                href={link || undefined}
                target="_blank"
                rel="noreferrer"
                aria-label={t("crewOpen")}
                className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-border/60 text-text-secondary hover:text-accent hover:border-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
          </div>
          <p className="text-xs text-text-secondary">{t("crewHelp")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" loading={busy === "replace"} onClick={() => create(true)}>
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              {t("crewReplace")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              loading={busy === "off"}
              onClick={turnOff}
            >
              <Link2Off aria-hidden="true" className="h-3.5 w-3.5" />
              {t("crewTurnOff")}
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary">{t("crewIntro")}</p>
          <Button type="button" variant="secondary" loading={busy === "create"} onClick={() => create(false)}>
            <HardHat aria-hidden="true" className="h-4 w-4" />
            {t("crewCreate")}
          </Button>
        </div>
      )}
    </div>
  );
}
