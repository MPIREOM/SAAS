"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, Copy, Check, RefreshCw, Building2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";

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
  const tc = useTranslations("common");
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
      <EmptyState
        icon={<Wrench className="h-5 w-5" />}
        title={t("noProperties")}
        className="py-10"
      />
    );
  }

  if (loading) {
    return <Spinner className="py-6" sizeClassName="h-5 w-5" label={tc("loading")} />;
  }

  return (
    <div className="space-y-3">
      {properties.map((p) => {
        const tk = tokensByProperty[p.id];
        const busy = busyId === p.id;
        return (
          <div
            key={p.id}
            className="space-y-3 rounded-lg border border-border/50 bg-surface-elevated/50 p-4 transition-colors hover:border-border"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
                <span className="truncate text-sm font-medium text-text-primary">
                  {p.name}
                </span>
              </div>
              {tk ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => regenerate(p.id)}
                  loading={busy}
                  title={t("regenerateLink")}
                  className="shrink-0"
                >
                  {!busy && (
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {t("regenerateLink")}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => generate(p.id)}
                  loading={busy}
                  className="shrink-0"
                >
                  {!busy && <Link2 aria-hidden="true" className="h-3.5 w-3.5" />}
                  {t("generateLink")}
                </Button>
              )}
            </div>
            {tk && (
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <Input
                    readOnly
                    value={linkFor(tk.token)}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={t("shareLink")}
                    className="h-8 truncate font-mono text-xs text-text-secondary"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy(p.id, tk.token)}
                  title={t("copyLink")}
                  aria-label={t("copyLink")}
                  className="h-8 w-8 shrink-0 p-0"
                >
                  {copiedId === p.id ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy aria-hidden="true" className="h-3.5 w-3.5 text-text-secondary" />
                  )}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
