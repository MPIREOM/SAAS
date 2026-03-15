"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Eye,
  Copy,
  Check,
  Trash2,
  MessageSquare,
  Plus,
  ExternalLink,
  Link2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";

interface Token {
  id: string;
  token: string;
  created_at: string;
}

interface SharePortalButtonProps {
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  locale: string;
}

export function SharePortalButton({
  tenantId,
  tenantName,
  tenantPhone,
  locale,
}: SharePortalButtonProps) {
  const t = useTranslations("tenantPortal");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadTokens();
  }, [open]);

  const loadTokens = async () => {
    setLoading(true);
    const res = await fetch(
      `/api/tenant-portal/generate-token?tenant_id=${tenantId}`
    );
    const data = await res.json();
    setTokens(data.tokens || []);
    setLoading(false);
  };

  const generateToken = async () => {
    setGenerating(true);
    const res = await fetch("/api/tenant-portal/generate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    if (res.ok) await loadTokens();
    setGenerating(false);
  };

  const revokeToken = async (tokenId: string) => {
    await fetch("/api/tenant-portal/generate-token", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token_id: tokenId }),
    });
    setTokens((prev) => prev.filter((t) => t.id !== tokenId));
  };

  const getLink = (token: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/${locale}/tenant-portal/${token}`;
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(getLink(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareWhatsApp = (token: string) => {
    const link = getLink(token);
    const phone = tenantPhone?.replace(/\D/g, "") || "";
    const message = encodeURIComponent(`${t("whatsappMessage")}\n\n${link}`);
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
      >
        <Eye className="h-4 w-4" />
        {t("sharePortal")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("sharePortal")}</DialogTitle>
            <DialogDescription>
              {t("sharePortalDescription")} {tenantName}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              {/* Generate button */}
              <button
                onClick={generateToken}
                disabled={generating}
                className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {generating ? tc("loading") : t("generateLink")}
              </button>

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
                        <div className="flex items-center gap-2">
                          <Link2 className="h-3.5 w-3.5 text-accent" />
                          <span className="text-xs text-text-secondary">
                            {new Date(tk.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => revokeToken(tk.id)}
                          className="p-1 rounded hover:bg-destructive/10 transition-colors"
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
    </>
  );
}
