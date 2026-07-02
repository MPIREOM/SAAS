"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Mail, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

interface NotificationPrefs {
  rent_upcoming: { email: boolean; whatsapp: boolean };
  rent_overdue: { email: boolean; whatsapp: boolean };
  cheque_due: { email: boolean; whatsapp: boolean };
  lease_expiry: { email: boolean; whatsapp: boolean };
}

const DEFAULT_PREFS: NotificationPrefs = {
  rent_upcoming: { email: true, whatsapp: true },
  rent_overdue: { email: true, whatsapp: true },
  cheque_due: { email: true, whatsapp: false },
  lease_expiry: { email: true, whatsapp: false },
};

type ReminderType = keyof NotificationPrefs;
type Channel = "email" | "whatsapp";

const REMINDER_TYPES: ReminderType[] = [
  "rent_upcoming",
  "rent_overdue",
  "cheque_due",
  "lease_expiry",
];

const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  rent_upcoming: "rentUpcoming",
  rent_overdue: "rentOverdue",
  cheque_due: "chequeDue",
  lease_expiry: "leaseExpiry",
};

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
      className={`relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        enabled ? "bg-accent" : "bg-border"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        aria-hidden="true"
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);

        const { data: profile } = await supabase
          .from("users")
          .select("notification_preferences")
          .eq("id", user.id)
          .single();

        if (profile?.notification_preferences) {
          setPrefs(profile.notification_preferences as NotificationPrefs);
        }
      } catch {
        // Fall back to defaults on error
      } finally {
        setLoading(false);
      }
    }

    fetchPreferences();
  }, []);

  const toggle = useCallback(
    async (type: ReminderType, channel: Channel) => {
      if (!userId || saving) return;

      const newPrefs = {
        ...prefs,
        [type]: {
          ...prefs[type],
          [channel]: !prefs[type][channel],
        },
      };

      setPrefs(newPrefs);
      setSaving(true);

      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("users")
          .update({ notification_preferences: newPrefs })
          .eq("id", userId);

        if (error) throw error;

        toast({
          title: t("preferencesSaved"),
          variant: "success",
        });
      } catch {
        // Revert on failure
        setPrefs(prefs);
        toast({
          title: t("preferencesError") ?? "Failed to save preferences",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [prefs, userId, saving, toast, t]
  );

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <span className="sr-only" role="status">
          {t("notificationPreferences")}
        </span>
        {REMINDER_TYPES.map((type) => (
          <Skeleton key={type} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Column headers */}
      <div className="flex items-center justify-end px-4 pb-1">
        <div className="flex w-14 items-center justify-center gap-1 text-xs text-text-secondary">
          <Mail aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("emailNotification")}</span>
        </div>
        <div className="ms-4 flex w-14 items-center justify-center gap-1 text-xs text-text-secondary sm:ms-6 sm:w-20">
          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("whatsappNotification")}</span>
        </div>
      </div>

      {/* Preference rows */}
      {REMINDER_TYPES.map((type) => (
        <div
          key={type}
          className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-elevated/50 px-4 py-3 transition-colors hover:border-border"
        >
          <span className="min-w-0 truncate pe-3 text-sm font-medium text-text-primary">
            {t(REMINDER_TYPE_LABELS[type])}
          </span>
          <div className="flex shrink-0 items-center">
            <div className="flex w-14 justify-center">
              <Toggle
                enabled={prefs[type].email}
                onToggle={() => toggle(type, "email")}
                disabled={saving}
                ariaLabel={`${t(REMINDER_TYPE_LABELS[type])} — ${t("emailNotification")}`}
              />
            </div>
            <div className="ms-4 flex w-14 justify-center sm:ms-6 sm:w-20">
              <Toggle
                enabled={prefs[type].whatsapp}
                onToggle={() => toggle(type, "whatsapp")}
                disabled={saving}
                ariaLabel={`${t(REMINDER_TYPE_LABELS[type])} — ${t("whatsappNotification")}`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
