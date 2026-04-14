"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/toast";

function Toggle({
  enabled,
  onToggle,
  disabled,
  ariaLabel,
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      disabled={disabled}
      className={`relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        enabled ? "bg-accent" : "bg-border"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const DAYS_VALUES = [0, 3, 5, 7, 10, 14, 30] as const;

export function AutoInvoiceSettings() {
  const t = useTranslations("settings");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [daysBefore, setDaysBefore] = useState(0);

  useEffect(() => {
    fetch("/api/invoices/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setEnabled(data.settings.auto_generate_enabled);
          setDaysBefore(data.settings.days_before_due);
        }
      })
      .catch(() => {
        toast({ title: t("autoInvoiceLoadFailed"), variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(newEnabled: boolean, newDays: number) {
    setSaving(true);
    try {
      const res = await fetch("/api/invoices/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_generate_enabled: newEnabled,
          days_before_due: newDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setEnabled(newEnabled);
      setDaysBefore(newDays);
      toast({ title: t("autoInvoiceSaved"), variant: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: t("autoInvoiceSaveFailed", { error: msg }),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6" aria-busy="true">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-text-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Auto-generate toggle */}
      <div className="flex items-center justify-between bg-surface-elevated border border-border rounded-md px-4 py-3">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {t("autoInvoiceToggleTitle")}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {t("autoInvoiceToggleHelp")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <Loader2
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin text-text-secondary"
            />
          )}
          <Toggle
            enabled={enabled}
            onToggle={() => save(!enabled, daysBefore)}
            disabled={saving}
            ariaLabel={t("autoInvoiceToggleTitle")}
          />
        </div>
      </div>

      {/* Days before selector */}
      {enabled && (
        <div className="bg-surface-elevated border border-border rounded-md px-4 py-3">
          <label
            htmlFor="auto-invoice-days"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            {t("autoInvoiceAdvanceLabel")}
          </label>
          <p className="text-xs text-text-secondary mb-3">
            {t("autoInvoiceAdvanceHelp")}
          </p>
          <select
            id="auto-invoice-days"
            value={daysBefore}
            onChange={(e) => save(enabled, Number(e.target.value))}
            disabled={saving}
            className="w-full sm:w-64 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
          >
            {DAYS_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`autoInvoiceDays.${value}`)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
