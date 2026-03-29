"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Send,
  MessageSquare,
  Mail,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

interface OverdueInvoice {
  amount: string;
  dueDate: string;
  periodLabel: string;
}

interface PreviewItem {
  tenantName: string;
  phone: string;
  email: string;
  reminderType: string;
  unitNumber: string;
  propertyName: string;
  amount: string;
  dueDate: string;
  overdueInvoices?: OverdueInvoice[];
  totalOverdue?: string;
  whatsappMessage: string;
  emailMessage: string;
  whatsappTemplateName: string;
}

interface TriggerResult {
  success: boolean;
  totalSent: number;
  results: {
    rentUpcoming: number;
    rentOverdue: number;
    chequeDue: number;
    leaseExpiry: number;
    errors: number;
    details: string[];
  };
}

const reminderTypeLabels: Record<string, string> = {
  rent_upcoming: "Rent Upcoming",
  rent_overdue: "Rent Overdue",
  cheque_due: "Cheque Due",
  lease_expiry: "Lease Expiry",
};

export function ReminderTriggerButton() {
  const t = useTranslations("reminders");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TriggerResult | null>(null);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  async function handlePreview() {
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/reminders/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? t("unauthorized") : t("triggerError"));
        return;
      }
      const data = await res.json();
      if (data.total === 0) {
        setResult({
          success: true,
          totalSent: 0,
          results: {
            rentUpcoming: 0,
            rentOverdue: 0,
            chequeDue: 0,
            leaseExpiry: 0,
            errors: 0,
            details: [],
          },
        });
        return;
      }
      setPreviews(data.previews);
      setShowPreview(true);
    } catch {
      setError(t("triggerError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/reminders/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? t("unauthorized") : t("triggerError"));
        return;
      }
      const data: TriggerResult = await res.json();
      setResult(data);
      setShowPreview(false);
      setPreviews([]);
      setExpandedIndex(null);
      router.refresh();
    } catch {
      setError(t("triggerError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handlePreview}
        disabled={loading}
        className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {t("runNow")}
      </button>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="p-4 rounded-lg bg-surface border border-border space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <CheckCircle2 className="h-4 w-4 text-success" />
            {t("triggerComplete", { count: result.totalSent })}
          </div>
          {result.totalSent > 0 && (
            <div className="space-y-1 text-xs text-text-secondary">
              {result.results.rentUpcoming > 0 && (
                <p>{t("type")}: rent upcoming — {result.results.rentUpcoming}</p>
              )}
              {result.results.rentOverdue > 0 && (
                <p>{t("type")}: rent overdue — {result.results.rentOverdue}</p>
              )}
              {result.results.chequeDue > 0 && (
                <p>{t("type")}: cheque due — {result.results.chequeDue}</p>
              )}
              {result.results.leaseExpiry > 0 && (
                <p>{t("type")}: lease expiry — {result.results.leaseExpiry}</p>
              )}
              {result.results.errors > 0 && (
                <p className="text-destructive">{t("errors")}: {result.results.errors}</p>
              )}
            </div>
          )}
          {result.totalSent === 0 && (
            <p className="text-xs text-text-secondary">{t("noRemindersToSend")}</p>
          )}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent maxWidth="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-accent" />
              {t("previewTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("previewDescription", { count: previews.length })}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="max-h-[60vh] overflow-y-auto space-y-3">
            {previews.map((item, i) => (
              <div
                key={i}
                className="border border-border rounded-lg overflow-hidden"
              >
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedIndex(expandedIndex === i ? null : i)
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated/50 transition-colors text-start"
                >
                  <User className="h-4 w-4 text-text-secondary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {item.tenantName}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {reminderTypeLabels[item.reminderType] || item.reminderType}
                      {item.unitNumber ? ` — ${item.unitNumber}` : ""}
                      {item.propertyName ? ` @ ${item.propertyName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.phone && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
                        WhatsApp
                      </span>
                    )}
                    {item.email && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                        Email
                      </span>
                    )}
                  </div>
                  <svg
                    className={`h-4 w-4 text-text-secondary transition-transform ${
                      expandedIndex === i ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Expanded message preview */}
                {expandedIndex === i && (
                  <div className="border-t border-border px-4 py-3 space-y-3 bg-surface-elevated/30">
                    {/* Overdue breakdown */}
                    {item.overdueInvoices && item.overdueInvoices.length > 0 && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                        <p className="text-xs font-medium text-destructive mb-2">
                          Outstanding Invoices ({item.overdueInvoices.length})
                        </p>
                        <div className="space-y-1">
                          {item.overdueInvoices.map((inv, j) => (
                            <div
                              key={j}
                              className="flex items-center justify-between text-xs text-text-secondary"
                            >
                              <span>{inv.periodLabel}</span>
                              <span className="font-mono">{inv.amount} OMR</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs font-semibold text-destructive mt-2 pt-2 border-t border-destructive/20">
                          <span>Total</span>
                          <span className="font-mono">{item.totalOverdue} OMR</span>
                        </div>
                      </div>
                    )}
                    {item.phone && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <MessageSquare className="h-3.5 w-3.5 text-success" />
                          <span className="text-xs font-medium text-text-secondary">
                            WhatsApp — {item.phone}
                          </span>
                        </div>
                        <div className="text-sm text-text-primary bg-surface rounded-lg p-3 border border-border whitespace-pre-wrap">
                          {item.whatsappMessage}
                        </div>
                        <p className="text-xs text-text-secondary mt-1">
                          Template: <code className="font-mono text-accent">{item.whatsappTemplateName}</code>
                        </p>
                      </div>
                    )}
                    {item.email && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Mail className="h-3.5 w-3.5 text-accent" />
                          <span className="text-xs font-medium text-text-secondary">
                            Email — {item.email}
                          </span>
                        </div>
                        <div className="text-sm text-text-primary bg-surface rounded-lg p-3 border border-border whitespace-pre-wrap">
                          {item.emailMessage}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setShowPreview(false);
                setExpandedIndex(null);
              }}
              className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("confirmSend", { count: previews.length })}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
