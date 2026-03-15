"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Link2,
  Copy,
  Check,
  Trash2,
  MessageSquare,
  Plus,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";

interface Lease {
  id: string;
  unit_id: string;
  is_active: boolean;
  units: {
    unit_number: string;
  };
}

interface Token {
  id: string;
  token: string;
  unit_id: string;
  created_at: string;
  units: {
    unit_number: string;
  };
}

interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  leases: Lease[];
  locale: string;
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  tenantPhone,
  leases,
  locale,
}: ShareLinkDialogProps) {
  const t = useTranslations("maintenanceRequest");
  const tc = useTranslations("common");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState("");

  const activeLeases = leases.filter((l) => l.is_active);

  useEffect(() => {
    if (open) {
      loadTokens();
      if (activeLeases.length === 1) {
        setSelectedUnitId(activeLeases[0].unit_id);
      }
    }
  }, [open]);

  const loadTokens = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/maintenance-request/generate-token?tenant_id=${tenantId}`
    );
    const data = await res.json();
    setTokens(data.tokens || []);
    setLoading(false);
  };

  const generateToken = async () => {
    if (!selectedUnitId) return;
    setGenerating(true);

    const res = await fetch("/api/maintenance-request/generate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, unit_id: selectedUnitId }),
    });

    if (res.ok) {
      await loadTokens();
    }
    setGenerating(false);
  };

  const revokeToken = async (tokenId: string) => {
    await fetch("/api/maintenance-request/generate-token", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token_id: tokenId }),
    });
    setTokens((prev) => prev.filter((t) => t.id !== tokenId));
  };

  const getLink = (token: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/${locale}/maintenance-request/${token}`;
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(getLink(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareWhatsApp = (token: string) => {
    const link = getLink(token);
    const phone = tenantPhone?.replace(/\D/g, "") || "";
    const message = encodeURIComponent(
      `${t("whatsappMessage")}\n\n${link}`
    );
    window.open(
      `https://wa.me/${phone}?text=${message}`,
      "_blank"
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("shareLink")}</DialogTitle>
          <DialogDescription>
            {t("shareLinkDescription")} {tenantName}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {/* Generate new link */}
            {activeLeases.length > 0 ? (
              <div className="flex items-end gap-2">
                {activeLeases.length > 1 && (
                  <div className="flex-1">
                    <label className="block text-xs text-text-secondary mb-1">
                      {t("unit")}
                    </label>
                    <select
                      value={selectedUnitId}
                      onChange={(e) => setSelectedUnitId(e.target.value)}
                      className="w-full h-9 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                    >
                      <option value="">--</option>
                      {activeLeases.map((l) => (
                        <option key={l.unit_id} value={l.unit_id}>
                          {l.units.unit_number}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={generateToken}
                  disabled={generating || !selectedUnitId}
                  className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {generating ? tc("loading") : t("generateLink")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                {t("noActiveLeases")}
              </p>
            )}

            {/* Existing links */}
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tokens.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  {t("activeLinks")}
                </p>
                {tokens.map((tk) => (
                  <div
                    key={tk.id}
                    className="bg-surface-elevated border border-border rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link2 className="h-3.5 w-3.5 text-accent shrink-0" />
                        <span className="text-xs text-text-secondary truncate">
                          {t("unit")} {(tk.units as Record<string, string>)?.unit_number}
                        </span>
                      </div>
                      <button
                        onClick={() => revokeToken(tk.id)}
                        className="p-1 rounded hover:bg-destructive/10 transition-colors"
                        title={t("revokeLink")}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        readOnly
                        value={getLink(tk.token)}
                        className="flex-1 h-8 bg-surface border border-border rounded-md px-2 text-xs text-text-secondary font-mono truncate"
                      />
                      <button
                        onClick={() => copyLink(tk.token)}
                        className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md border border-border hover:bg-accent/10 transition-colors"
                        title={t("copyLink")}
                      >
                        {copied === tk.token ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-text-secondary" />
                        )}
                      </button>
                      <button
                        onClick={() => window.open(getLink(tk.token), "_blank")}
                        className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md border border-border hover:bg-accent/10 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-text-secondary" />
                      </button>
                      {tenantPhone && (
                        <button
                          onClick={() => shareWhatsApp(tk.token)}
                          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md border border-border bg-success/10 hover:bg-success/20 transition-colors"
                          title={t("shareViaWhatsApp")}
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-success" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
