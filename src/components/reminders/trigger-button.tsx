"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Play,
  Eye,
  Send,
  MessageSquare,
  Mail,
  User,
  ChevronDown,
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
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CURRENCY } from "@/lib/currency";

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

const KNOWN_REMINDER_TYPES = [
  "rent_upcoming",
  "rent_overdue",
  "cheque_due",
  "lease_expiry",
] as const;

export function ReminderTriggerButton() {
  const t = useTranslations("reminders");
  const tc = useTranslations("common");
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

  const reminderTypeLabel = (type: string) =>
    (KNOWN_REMINDER_TYPES as readonly string[]).includes(type)
      ? t(`types.${type}`)
      : type;

  return (
    <div className="space-y-3">
      <Button type="button" onClick={handlePreview} loading={loading}>
        {!loading && <Play aria-hidden="true" className="h-4 w-4" />}
        {t("runNow")}
      </Button>

      {error && <Alert variant="destructive">{error}</Alert>}

      {result && (
        <Alert
          variant="success"
          title={t("triggerComplete", { count: result.totalSent })}
          className="animate-fade-in-up text-start"
        >
          {result.totalSent > 0 && (
            <div className="space-y-1 text-xs text-text-secondary">
              {result.results.rentUpcoming > 0 && (
                <p>
                  {t("types.rent_upcoming")} —{" "}
                  <span className="font-mono ltr-nums">{result.results.rentUpcoming}</span>
                </p>
              )}
              {result.results.rentOverdue > 0 && (
                <p>
                  {t("types.rent_overdue")} —{" "}
                  <span className="font-mono ltr-nums">{result.results.rentOverdue}</span>
                </p>
              )}
              {result.results.chequeDue > 0 && (
                <p>
                  {t("types.cheque_due")} —{" "}
                  <span className="font-mono ltr-nums">{result.results.chequeDue}</span>
                </p>
              )}
              {result.results.leaseExpiry > 0 && (
                <p>
                  {t("types.lease_expiry")} —{" "}
                  <span className="font-mono ltr-nums">{result.results.leaseExpiry}</span>
                </p>
              )}
              {result.results.errors > 0 && (
                <p className="text-destructive">
                  {t("errors")}:{" "}
                  <span className="font-mono ltr-nums">{result.results.errors}</span>
                </p>
              )}
            </div>
          )}
          {result.totalSent === 0 && (
            <p className="text-xs text-text-secondary">{t("noRemindersToSend")}</p>
          )}
        </Alert>
      )}

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent maxWidth="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye aria-hidden="true" className="h-5 w-5 text-accent" />
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
                className="overflow-hidden rounded-lg border border-border/60"
              >
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedIndex(expandedIndex === i ? null : i)
                  }
                  aria-expanded={expandedIndex === i}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <User aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {item.tenantName}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {reminderTypeLabel(item.reminderType)}
                      {item.unitNumber ? ` — ${item.unitNumber}` : ""}
                      {item.propertyName ? ` @ ${item.propertyName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.phone && (
                      <Badge variant="success">{t("channels.whatsapp")}</Badge>
                    )}
                    {item.email && (
                      <Badge variant="default">{t("channels.email")}</Badge>
                    )}
                  </div>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 ${
                      expandedIndex === i ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Expanded message preview */}
                {expandedIndex === i && (
                  <div className="space-y-3 border-t border-border/60 bg-surface-elevated/30 px-4 py-3">
                    {/* Overdue breakdown */}
                    {item.overdueInvoices && item.overdueInvoices.length > 0 && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                        <p className="mb-2 text-xs font-medium text-destructive">
                          Outstanding Invoices (
                          <span className="font-mono ltr-nums">
                            {item.overdueInvoices.length}
                          </span>
                          )
                        </p>
                        <div className="space-y-1">
                          {item.overdueInvoices.map((inv, j) => (
                            <div
                              key={j}
                              className="flex items-center justify-between text-xs text-text-secondary"
                            >
                              <span>{inv.periodLabel}</span>
                              <span className="font-mono ltr-nums">
                                {inv.amount} {CURRENCY.code}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-destructive/20 pt-2 text-xs font-semibold text-destructive">
                          <span>{tc("total")}</span>
                          <span className="font-mono ltr-nums">
                            {item.totalOverdue} {CURRENCY.code}
                          </span>
                        </div>
                      </div>
                    )}
                    {item.phone && (
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5 text-success" />
                          <span className="text-xs font-medium text-text-secondary">
                            {t("channels.whatsapp")} —{" "}
                            <span className="font-mono ltr-nums">{item.phone}</span>
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-surface p-3 text-sm text-text-primary">
                          {item.whatsappMessage}
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">
                          {t("whatsappTemplateName")}:{" "}
                          <code className="font-mono text-accent">
                            {item.whatsappTemplateName}
                          </code>
                        </p>
                      </div>
                    )}
                    {item.email && (
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <Mail aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
                          <span className="text-xs font-medium text-text-secondary">
                            {t("channels.email")} — {item.email}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-surface p-3 text-sm text-text-primary">
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowPreview(false);
                setExpandedIndex(null);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="button" onClick={handleSend} loading={sending}>
              {!sending && <Send aria-hidden="true" className="h-4 w-4" />}
              {t("confirmSend", { count: previews.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
