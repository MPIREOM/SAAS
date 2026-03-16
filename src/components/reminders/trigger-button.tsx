"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Play, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

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

export function ReminderTriggerButton() {
  const t = useTranslations("reminders");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriggerResult | null>(null);
  const [error, setError] = useState("");

  async function handleTrigger() {
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/reminders/trigger", { method: "POST" });
      if (!res.ok) {
        setError(res.status === 401 ? t("unauthorized") : t("triggerError"));
        return;
      }
      const data: TriggerResult = await res.json();
      setResult(data);
      router.refresh();
    } catch {
      setError(t("triggerError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleTrigger}
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
    </div>
  );
}
