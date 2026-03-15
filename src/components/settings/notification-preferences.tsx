"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Mail, MessageSquare } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface NotificationPrefs {
  rentUpcoming: { email: boolean; whatsapp: boolean };
  rentOverdue: { email: boolean; whatsapp: boolean };
  chequeDue: { email: boolean; whatsapp: boolean };
  leaseExpiry: { email: boolean; whatsapp: boolean };
}

const STORAGE_KEY = "notification_preferences";

const DEFAULT_PREFS: NotificationPrefs = {
  rentUpcoming: { email: true, whatsapp: false },
  rentOverdue: { email: true, whatsapp: false },
  chequeDue: { email: true, whatsapp: false },
  leaseExpiry: { email: true, whatsapp: false },
};

type ReminderType = keyof NotificationPrefs;
type Channel = "email" | "whatsapp";

const REMINDER_TYPES: ReminderType[] = [
  "rentUpcoming",
  "rentOverdue",
  "chequeDue",
  "leaseExpiry",
];

function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        enabled ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function NotificationPreferences() {
  const t = useTranslations("settings");
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPrefs(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
    setLoaded(true);
  }, []);

  function toggle(type: ReminderType, channel: Channel) {
    setPrefs((prev) => {
      const updated = {
        ...prev,
        [type]: {
          ...prev[type],
          [channel]: !prev[type][channel],
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      toast({
        title: t("preferencesSaved"),
        variant: "success",
      });
      return updated;
    });
  }

  if (!loaded) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-12 bg-surface-elevated border border-border rounded-md animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="flex items-center justify-end gap-6 px-4 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Mail className="h-3.5 w-3.5" />
          <span>{t("emailNotification")}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>{t("whatsappNotification")}</span>
        </div>
      </div>

      {/* Preference rows */}
      {REMINDER_TYPES.map((type) => (
        <div
          key={type}
          className="flex items-center justify-between bg-surface-elevated border border-border rounded-md px-4 py-3"
        >
          <span className="text-sm text-text-primary font-medium">
            {t(type)}
          </span>
          <div className="flex items-center gap-10">
            <Toggle
              enabled={prefs[type].email}
              onToggle={() => toggle(type, "email")}
            />
            <Toggle
              enabled={prefs[type].whatsapp}
              onToggle={() => toggle(type, "whatsapp")}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
