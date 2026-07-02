"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
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

export function TenantNotificationToggles({
  tenants: initialTenants,
}: {
  tenants: TenantItem[];
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
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
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title={t("noTenantsAvailable")}
        className="py-10"
      />
    );
  }

  const leaseLine = (tenant: TenantItem) => {
    if (tenant.property_name && tenant.unit_number) {
      return `${tenant.property_name} · ${tc("unit")} ${tenant.unit_number}`;
    }
    if (tenant.property_name) return tenant.property_name;
    if (tenant.unit_number) return `${tc("unit")} ${tenant.unit_number}`;
    return null;
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-text-secondary"
        />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchTenants")}
          aria-label={t("searchTenants")}
          className="ps-9"
        />
      </div>

      {/* Tenant list */}
      <div className="max-h-80 space-y-1.5 overflow-y-auto">
        {filtered.map((tenant) => (
          <div
            key={tenant.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-surface-elevated/50 px-4 py-3 transition-colors hover:border-border"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Users
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-text-secondary"
              />
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {tenant.full_name}
                </span>
                {leaseLine(tenant) && (
                  <span className="block truncate text-xs text-text-secondary">
                    {leaseLine(tenant)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {savingId === tenant.id && (
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin text-text-secondary"
                />
              )}
              <Toggle
                enabled={tenant.notifications_enabled}
                onToggle={() => toggleTenant(tenant.id)}
                disabled={savingId !== null}
                ariaLabel={`${t("tenantNotifications")} — ${tenant.full_name}`}
              />
            </div>
          </div>
        ))}
        {filtered.length === 0 && search && (
          <p className="py-4 text-center text-sm text-text-secondary" role="status">
            {tc("noResults")}
          </p>
        )}
      </div>
    </div>
  );
}
