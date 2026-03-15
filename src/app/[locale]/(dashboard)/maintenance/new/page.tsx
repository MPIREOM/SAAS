"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

interface UnitOption {
  id: string;
  unit_number: string;
  properties: { name: string } | null;
}

interface TenantOption {
  id: string;
  full_name: string;
}

export default function NewMaintenanceRequestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("maintenance");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [locale, setLocale] = useState("en");

  // Resolve locale from params once
  useEffect(() => {
    params.then((p) => setLocale(p.locale));
  }, [params]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const supabase = createClient();

        const [unitsRes, tenantsRes] = await Promise.all([
          supabase
            .from("units")
            .select("id, unit_number, properties:property_id(name)")
            .order("unit_number"),
          supabase
            .from("tenants")
            .select("id, full_name")
            .eq("status", "active")
            .order("full_name"),
        ]);

        if (unitsRes.data) setUnits(unitsRes.data as unknown as UnitOption[]);
        if (tenantsRes.data) setTenants(tenantsRes.data as unknown as TenantOption[]);
      } catch (err) {
        console.error("Failed to load form options:", err);
      } finally {
        setOptionsLoading(false);
      }
    };

    fetchOptions();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new FormData(e.currentTarget);
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Authentication error. Please refresh and try again.");
        setLoading(false);
        return;
      }

      const unitId = formData.get("unit_id") as string;
      if (!unitId) {
        setError("Please select a unit.");
        setLoading(false);
        return;
      }

      const payload: Record<string, unknown> = {
        unit_id: unitId,
        category: formData.get("category") as string,
        description: formData.get("description") as string,
        urgency: formData.get("urgency") as string,
        status: "open",
        created_by: user.id,
      };

      const tenantId = formData.get("tenant_id") as string;
      if (tenantId) payload.tenant_id = tenantId;

      const assignedName = formData.get("assigned_to_name") as string;
      if (assignedName) payload.assigned_to_name = assignedName;

      const assignedPhone = formData.get("assigned_to_phone") as string;
      if (assignedPhone) payload.assigned_to_phone = assignedPhone;

      const estimatedCost = formData.get("estimated_cost") as string;
      if (estimatedCost) payload.estimated_cost = parseFloat(estimatedCost);

      const { error: insertError } = await supabase
        .from("maintenance_requests")
        .insert(payload);

      if (insertError) {
        console.error("Maintenance insert error:", insertError);
        setError(insertError.message);
        setLoading(false);
        return;
      }

      router.push(`/${locale}/maintenance`);
      router.refresh();
    } catch (err) {
      console.error("Unexpected error creating maintenance request:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full h-10 bg-surface-elevated/50 border border-border/60 rounded-lg px-3 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-surface-elevated transition-all duration-200";

  const labelClass = "block text-sm font-medium text-text-secondary mb-1.5 tracking-tight";

  return (
    <div className="max-w-2xl animate-fade-in-up">
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {tc("back")}
        </button>
        <h1 className="text-2xl font-display font-bold text-text-primary tracking-tight">
          {t("createRequest")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t("subtitle")}
        </p>
      </div>

      {optionsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 text-accent animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-surface border border-border/40 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  {t("table.unit")} <span className="text-destructive">*</span>
                </label>
                <select name="unit_id" required className={inputClass}>
                  <option value="">Select unit...</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.properties?.name ? `${unit.properties.name} - ` : ""}
                      {unit.unit_number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  {t("assignedTo")}
                </label>
                <select name="tenant_id" className={inputClass}>
                  <option value="">Select tenant (optional)...</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  {t("category")} <span className="text-destructive">*</span>
                </label>
                <select name="category" required className={inputClass}>
                  <option value="plumbing">{t("categories.plumbing")}</option>
                  <option value="electrical">{t("categories.electrical")}</option>
                  <option value="ac">{t("categories.ac")}</option>
                  <option value="structural">{t("categories.structural")}</option>
                  <option value="other">{t("categories.other")}</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  {t("urgency")} <span className="text-destructive">*</span>
                </label>
                <select name="urgency" required className={inputClass}>
                  <option value="low">{t("urgencies.low")}</option>
                  <option value="medium">{t("urgencies.medium")}</option>
                  <option value="high">{t("urgencies.high")}</option>
                  <option value="emergency">{t("urgencies.emergency")}</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                {t("description")} <span className="text-destructive">*</span>
              </label>
              <textarea
                name="description"
                required
                rows={4}
                className="w-full bg-surface-elevated/50 border border-border/60 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-surface-elevated transition-all duration-200 resize-none"
                placeholder={t("description") + "..."}
              />
            </div>
          </div>

          <div className="bg-surface border border-border/40 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-display font-semibold text-text-primary tracking-tight">
              {t("vendor")} ({tc("optional")})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  {t("assignedTo")}
                </label>
                <input
                  name="assigned_to_name"
                  className={inputClass}
                  placeholder="Technician name"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Phone
                </label>
                <input
                  name="assigned_to_phone"
                  className={`${inputClass} font-mono`}
                  placeholder="+968 XXXX XXXX"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                {t("estimatedCost")} (OMR)
              </label>
              <input
                name="estimated_cost"
                type="number"
                min="0"
                step="0.01"
                className={`${inputClass} font-mono`}
                placeholder="0.00"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" loading={loading}>
              {tc("submit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {tc("cancel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
