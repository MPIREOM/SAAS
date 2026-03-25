"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Loader2 } from "lucide-react";
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
      <div className="bg-surface-elevated border border-border rounded-md p-4">
        <p className="text-sm text-text-secondary">
          {t("noPropertiesAvailable")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {properties.map((property) => (
        <div
          key={property.id}
          className="flex items-center justify-between bg-surface-elevated border border-border rounded-md px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-text-secondary" />
            <span className="text-sm text-text-primary font-medium">
              {property.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {savingId === property.id && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-text-secondary" />
            )}
            <Toggle
              enabled={property.notifications_enabled}
              onToggle={() => toggleProperty(property.id)}
              disabled={savingId !== null}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
