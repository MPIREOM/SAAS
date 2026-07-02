"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

interface Property {
  id: string;
  name: string;
  notifications_enabled: boolean;
}

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

export function PropertyNotificationToggles({
  properties: initialProperties,
}: {
  properties: Property[];
}) {
  const t = useTranslations("settings");
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggleProperty(propertyId: string) {
    if (savingId) return;

    const property = properties.find((p) => p.id === propertyId);
    if (!property) return;

    const newValue = !property.notifications_enabled;

    // Optimistic update
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId ? { ...p, notifications_enabled: newValue } : p
      )
    );
    setSavingId(propertyId);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("properties")
        .update({ notifications_enabled: newValue })
        .eq("id", propertyId);

      if (error) throw error;

      toast({
        title: newValue
          ? t("propertyNotificationsEnabled")
          : t("propertyNotificationsDisabled"),
        variant: "success",
      });
    } catch {
      // Revert on failure
      setProperties((prev) =>
        prev.map((p) =>
          p.id === propertyId
            ? { ...p, notifications_enabled: !newValue }
            : p
        )
      );
      toast({
        title: t("propertyNotificationsError"),
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  }

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title={t("noPropertiesAvailable")}
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {properties.map((property) => (
        <div
          key={property.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-surface-elevated/50 px-4 py-3 transition-colors hover:border-border"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Building2
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-text-secondary"
            />
            <span className="truncate text-sm font-medium text-text-primary">
              {property.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {savingId === property.id && (
              <Loader2
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin text-text-secondary"
              />
            )}
            <Toggle
              enabled={property.notifications_enabled}
              onToggle={() => toggleProperty(property.id)}
              disabled={savingId !== null}
              ariaLabel={`${t("propertyNotifications")} — ${property.name}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
