"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Settings2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
} from "lucide-react";

interface ReminderSetting {
  id: string;
  reminder_type: string;
  days_before: number[];
  repeat_interval_days: number | null;
  is_enabled: boolean;
}

const typeLabels: Record<string, Record<string, string>> = {
  rent_upcoming: {
    label: "Rent Upcoming",
    description: "Days before due date to send reminder",
  },
  rent_overdue: {
    label: "Rent Overdue",
    description: "Days after due date to start, then repeat interval",
  },
  lease_expiry: {
    label: "Lease Expiry",
    description: "Days before lease end date to notify",
  },
  cheque_due: {
    label: "Cheque Due",
    description: "Days before cheque date to send reminder",
  },
};

export function ReminderRules() {
  const t = useTranslations("reminders");
  const tc = useTranslations("common");
  const [settings, setSettings] = useState<ReminderSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [newDayInputs, setNewDayInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/reminders/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  function toggleEnabled(type: string) {
    setSettings((prev) =>
      prev.map((s) =>
        s.reminder_type === type ? { ...s, is_enabled: !s.is_enabled } : s
      )
    );
    setSaved(false);
  }

  function removeDay(type: string, dayIndex: number) {
    setSettings((prev) =>
      prev.map((s) =>
        s.reminder_type === type
          ? { ...s, days_before: s.days_before.filter((_, i) => i !== dayIndex) }
          : s
      )
    );
    setSaved(false);
  }

  function addDay(type: string) {
    const val = parseInt(newDayInputs[type] || "", 10);
    if (isNaN(val) || val < 0) return;
    setSettings((prev) =>
      prev.map((s) => {
        if (s.reminder_type !== type) return s;
        if (s.days_before.includes(val)) return s;
        return {
          ...s,
          days_before: [...s.days_before, val].sort((a, b) => a - b),
        };
      })
    );
    setNewDayInputs((prev) => ({ ...prev, [type]: "" }));
    setSaved(false);
  }

  function updateRepeatInterval(type: string, value: string) {
    const num = value === "" ? null : parseInt(value, 10);
    setSettings((prev) =>
      prev.map((s) =>
        s.reminder_type === type
          ? { ...s, repeat_interval_days: num }
          : s
      )
    );
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/reminders/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: settings.map((s) => ({
            reminder_type: s.reminder_type,
            days_before: s.days_before,
            repeat_interval_days: s.repeat_interval_days,
            is_enabled: s.is_enabled,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-text-primary font-display flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-text-secondary" />
          {t("rules")}
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : null}
          {saved ? t("rulesSaved") : tc("save")}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-3">
        {settings.map((setting) => {
          const meta = typeLabels[setting.reminder_type] || {
            label: setting.reminder_type,
            description: "",
          };
          const isOverdue = setting.reminder_type === "rent_overdue";

          return (
            <div
              key={setting.id}
              className={`bg-surface border rounded-lg p-5 transition-colors ${
                setting.is_enabled
                  ? "border-border"
                  : "border-border/50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-text-primary font-display">
                    {meta.label}
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {meta.description}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setting.is_enabled}
                    onChange={() => toggleEnabled(setting.reminder_type)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-border rounded-full peer peer-checked:bg-accent transition-colors after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>

              {setting.is_enabled && (
                <div className="space-y-3">
                  {/* Days chips */}
                  <div>
                    <label className="text-xs text-text-secondary mb-1.5 block">
                      {isOverdue ? t("rulesStartAfterDays") : t("rulesDaysBefore")}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {setting.days_before.map((day, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 h-7 px-2.5 bg-accent/10 text-accent text-xs font-medium rounded-lg"
                        >
                          {day} {day === 1 ? t("rulesDay") : t("rulesDays")}
                          <button
                            type="button"
                            onClick={() =>
                              removeDay(setting.reminder_type, i)
                            }
                            className="hover:text-destructive transition-colors ml-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={newDayInputs[setting.reminder_type] || ""}
                          onChange={(e) =>
                            setNewDayInputs((prev) => ({
                              ...prev,
                              [setting.reminder_type]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addDay(setting.reminder_type);
                            }
                          }}
                          placeholder="0"
                          className="w-16 h-7 bg-surface-elevated border border-border rounded-md px-2 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => addDay(setting.reminder_type)}
                          className="h-7 w-7 inline-flex items-center justify-center bg-surface-elevated border border-border rounded-md hover:border-accent text-text-secondary hover:text-accent transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Repeat interval (only for overdue) */}
                  {isOverdue && (
                    <div>
                      <label className="text-xs text-text-secondary mb-1.5 block">
                        {t("rulesRepeatEvery")}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={setting.repeat_interval_days ?? ""}
                          onChange={(e) =>
                            updateRepeatInterval(
                              setting.reminder_type,
                              e.target.value
                            )
                          }
                          placeholder="—"
                          className="w-20 h-8 bg-surface-elevated border border-border rounded-md px-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                        />
                        <span className="text-xs text-text-secondary">
                          {t("rulesDays")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
