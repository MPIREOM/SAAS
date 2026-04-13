"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Link2,
  Copy,
  Check,
  RefreshCw,
  Building2,
  Loader2,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
}

interface PropertyToken {
  id: string;
  property_id: string;
  token: string;
}

interface Props {
  properties: Property[];
  locale: string;
}

export function PropertyMaintenanceLinks({ properties, locale }: Props) {
  const t = useTranslations("maintenanceRequest");
  const [tokensByProperty, setTokensByProperty] = useState<Record<string, PropertyToken>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/maintenance-request/generate-token");
      const data = await res.json();
      if (cancelled) return;
      const map: Record<string, PropertyToken> = {};
      for (const tk of (data.tokens || []) as PropertyToken[]) {
        if (tk.property_id) map[tk.property_id] = tk;
      }
      setTokensByProperty(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = async (propertyId: string) => {
    setBusyId(propertyId);
    const res = await fetch("/api/maintenance-request/generate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: propertyId }),
    });
    if (res.ok) {
      const data = await res.json();
      setTokensByProperty((prev) => ({
        ...prev,
        [propertyId]: { id: data.id, property_id: propertyId, token: data.token },
      }));
    }
    setBusyId(null);
  };

  const regenerate = async (propertyId: string) => {
    const existing = tokensByProperty[propertyId];
    if (!existing) return;
    if (!window.confirm(t("regenerateConfirm"))) return;
    setBusyId(propertyId);
    // Revoke the old one, then generate fresh
    await fetch("/api/maintenance-request/generate-token", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token_id: existing.id }),
    });
    setTokensByProperty((prev) => {
      const next = { ...prev };
      delete next[propertyId];
      return next;
    });
    await generate(propertyId);
  };

  const linkFor = (token: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/${locale}/maintenance-request/${token}`;
  };

  const copy = async (propertyId: string, token: string) => {
    await navigator.clipboard.writeText(linkFor(token));
    setCopiedId(propertyId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (properties.length === 0) {
    return (
      <div className="bg-surface-elevated border border-border rounded-md p-4">
        <p className="text-sm text-text-secondary">{t("noProperties")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {properties.map((p) => {
        const tk = tokensByProperty[p.id];
        const busy = busyId === p.id;
        return (
          <div
            key={p.id}
            className="bg-surface-elevated border border-border rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 text-accent shrink-0" />
                <span className="text-sm font-medium text-text-primary truncate">
                  {p.name}
                </span>
              </div>
              {tk ? (
                <button
                  onClick={() => regenerate(p.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface hover:bg-border/30 transition-colors text-xs text-text-secondary disabled:opacity-50"
                  title={t("regenerateLink")}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {t("regenerateLink")}
                </button>
              ) : (
                <button
                  onClick={() => generate(p.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-background text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  {t("generateLink")}
                </button>
              )}
            </div>
            {tk && (
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={linkFor(tk.token)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 h-8 bg-surface border border-border rounded-md px-2 text-xs text-text-secondary font-mono truncate"
                />
                <button
                  onClick={() => copy(p.id, tk.token)}
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md border border-border hover:bg-accent/10 transition-colors"
                  title={t("copyLink")}
                >
                  {copiedId === p.id ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-text-secondary" />
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
