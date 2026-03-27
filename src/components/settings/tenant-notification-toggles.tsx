"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

interface TenantItem {
  id: string;
  full_name: string;
  phone: string;
  notifications_enabled: boolean;
  property_name?: string;
  unit_number?: string;
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

export function TenantNotificationToggles({
  tenants: initialTenants,
}: {
  tenants: TenantItem[];
}) {
  const t = useTranslations("settings");
  const { toast } = useToast();
  const [tenants, setTenants] = useState<TenantItem[]>(initialTenants);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = search
    ? tenants.filter(
        (tenant) =>
          tenant.full_name.toLowerCase().includes(search.toLowerCase()) ||
          tenant.phone.includes(search) ||
          tenant.property_name?.toLowerCase().includes(search.toLowerCase()) ||
          tenant.unit_number?.toLowerCase().includes(search.toLowerCase())
      )
    : tenants;

  async function toggleTenant(tenantId: string) {
    if (savingId) return;

    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) return;

    const newValue = !tenant.notifications_enabled;

    // Optimistic update
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenantId ? { ...t, notifications_enabled: newValue } : t
      )
    );
    setSavingId(tenantId);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("tenants")
        .update({ notifications_enabled: newValue })
        .eq("id", tenantId);

      if (error) throw error;

      toast({
        title: newValue
          ? t("tenantNotificationsEnabled")
          : t("tenantNotificationsDisabled"),
        variant: "success",
      });
    } catch {
      // Revert on failure
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenantId
            ? { ...t, notifications_enabled: !newValue }
            : t
        )
      );
      toast({
        title: t("tenantNotificationsError"),
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  }

  if (tenants.length === 0) {
    return (
      <div className="bg-surface-elevated border border-border rounded-md p-4">
        <p className="text-sm text-text-secondary">
          {t("noTenantsAvailable")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchTenants")}
          className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
        />
      </div>

      {/* Tenant list */}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {filtered.map((tenant) => (
          <div
            key={tenant.id}
            className="flex items-center justify-between bg-surface-elevated border border-border rounded-md px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Users className="h-4 w-4 text-text-secondary shrink-0" />
              <div className="min-w-0">
                <span className="text-sm text-text-primary font-medium block truncate">
                  {tenant.full_name}
                </span>
                {(tenant.property_name || tenant.unit_number) && (
                  <span className="text-xs text-text-secondary block truncate">
                    {[tenant.property_name, tenant.unit_number]
                      .filter(Boolean)
                      .join(" · Unit ")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {savingId === tenant.id && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-text-secondary" />
              )}
              <Toggle
                enabled={tenant.notifications_enabled}
                onToggle={() => toggleTenant(tenant.id)}
                disabled={savingId !== null}
              />
            </div>
          </div>
        ))}
        {filtered.length === 0 && search && (
          <div className="text-sm text-text-secondary text-center py-4">
            No tenants match &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
