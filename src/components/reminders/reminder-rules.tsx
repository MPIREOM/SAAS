"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Settings2, CheckCircle2, Plus, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface ReminderSetting {
  id: string;
  reminder_type: string;
  days_before: number[];
  repeat_interval_days: number | null;
  is_enabled: boolean;
}

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
      .catch(() => setError(t("loadFailed")))
      .finally(() => setLoading(false));
  }, [t]);

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
        setError(data.error || t("saveFailed"));
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Spinner label={tc("loading")} className="py-12" />;
  }

  return (
    <section className="space-y-4 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 border border-accent/15">
            <Settings2 aria-hidden="true" className="h-4 w-4 text-accent" />
          </span>
          <h2 className="text-lg font-semibold text-text-primary font-display">
            {t("rules")}
          </h2>
        </div>
        <Button type="button" onClick={handleSave} loading={saving}>
          {!saving && saved && (
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          )}
          {saved ? t("rulesSaved") : tc("save")}
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="space-y-3 stagger-children">
        {settings.map((setting) => {
          // Look up the localized label and description for this rule
          // type. The DB stores snake_case keys (rent_upcoming, etc.) so
          // we read directly from the matching i18n leaves.
          const label = t(`types.${setting.reminder_type}`);
          const description = t(`ruleDescriptions.${setting.reminder_type}`);
          const isOverdue = setting.reminder_type === "rent_overdue";

          return (
            <div
              key={setting.id}
              className={`rounded-xl border bg-surface p-5 transition-all duration-200 ${
                setting.is_enabled
                  ? "border-border/60"
                  : "border-border/40 opacity-60"
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-text-primary font-display">
                    {label}
                  </h3>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {description}
                  </p>
                </div>
                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={setting.is_enabled}
                    onChange={() => toggleEnabled(setting.reminder_type)}
                    className="sr-only peer"
                  />
                  <span className="sr-only">{label}</span>
                  <div className="w-9 h-5 bg-border rounded-full peer transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>

              {setting.is_enabled && (
                <div className="space-y-3">
                  {/* Days chips */}
                  <div>
                    <p className="mb-1.5 block text-xs text-text-secondary">
                      {isOverdue ? t("rulesStartAfterDays") : t("rulesDaysBefore")}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {setting.days_before.map((day, i) => (
                        <span
                          key={i}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-accent/20 bg-accent/10 px-2.5 text-xs font-medium text-accent"
                        >
                          <span className="font-mono ltr-nums">{day}</span>{" "}
                          {day === 1 ? t("rulesDay") : t("rulesDays")}
                          <button
                            type="button"
                            onClick={() => removeDay(setting.reminder_type, i)}
                            aria-label={tc("delete")}
                            className="ms-0.5 cursor-pointer rounded transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                          >
                            <X aria-hidden="true" className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <div className="inline-flex items-center gap-1">
                        <Input
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
                          aria-label={
                            isOverdue ? t("rulesStartAfterDays") : t("rulesDaysBefore")
                          }
                          className="h-7 w-16 px-2 py-0 text-xs font-mono ltr-nums"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => addDay(setting.reminder_type)}
                          aria-label={tc("create")}
                          className="h-7 w-7 p-0"
                        >
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Repeat interval (only for overdue) */}
                  {isOverdue && (
                    <div>
                      <p className="mb-1.5 block text-xs text-text-secondary">
                        {t("rulesRepeatEvery")}
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
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
                          aria-label={t("rulesRepeatEvery")}
                          className="h-8 w-20 px-2 py-0 font-mono ltr-nums"
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
    </section>
  );
}
