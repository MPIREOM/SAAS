"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

function Toggle({
  enabled,
  onToggle,
  disabled,
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`relative h-5 w-9 rounded-full transition-colors ${
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

const DAYS_OPTIONS = [
  { value: 0, label: "On the due day (no advance)" },
  { value: 3, label: "3 days before" },
  { value: 5, label: "5 days before" },
  { value: 7, label: "7 days before" },
  { value: 10, label: "10 days before" },
  { value: 14, label: "14 days before" },
  { value: 30, label: "30 days before (full month)" },
];

export function AutoInvoiceSettings() {
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
        toast({ title: "Failed to load invoice settings", variant: "destructive" });
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
      toast({ title: "Invoice settings saved", variant: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: `Failed to save invoice settings: ${msg}`, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Auto-generate toggle */}
      <div className="flex items-center justify-between bg-surface-elevated border border-border rounded-md px-4 py-3">
        <div>
          <p className="text-sm font-medium text-text-primary">Auto-generate invoices</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Automatically create monthly invoices for all active leases
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-secondary" />}
          <Toggle
            enabled={enabled}
            onToggle={() => save(!enabled, daysBefore)}
            disabled={saving}
          />
        </div>
      </div>

      {/* Days before selector */}
      {enabled && (
        <div className="bg-surface-elevated border border-border rounded-md px-4 py-3">
          <label className="block text-sm font-medium text-text-primary mb-1">
            Generate invoices in advance
          </label>
          <p className="text-xs text-text-secondary mb-3">
            How many days before the due date should invoices be created? For example, if set to 5 days and rent is due on the 1st, the invoice will be created on the 26th of the previous month.
          </p>
          <select
            value={daysBefore}
            onChange={(e) => save(enabled, Number(e.target.value))}
            disabled={saving}
            className="w-full sm:w-64 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
          >
            {DAYS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
