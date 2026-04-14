"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { Loader2 } from "lucide-react";

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
  const { locale } = use(params);
  const tc = useTranslations("common");
  const t = useTranslations("maintenance");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [preselectedUnitId, setPreselectedUnitId] = useState("");

  // Read ?unitId from URL once on mount so deep-links from a unit page
  // pre-populate the dropdown without a layout-shift.
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const unitId = searchParams.get("unitId");
    if (unitId) setPreselectedUnitId(unitId);
  }, []);

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
      } catch {
        // Options load failure is non-critical; form will show empty selects.
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
        setError(t("authError"));
        setLoading(false);
        return;
      }

      const unitId = formData.get("unit_id") as string;
      if (!unitId) {
        setError(t("unitRequired"));
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
        setError(insertError.message);
        setLoading(false);
        return;
      }

      router.push(`/${locale}/maintenance`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unexpectedError"));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={t("createRequest")}
        description={t("subtitle")}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/maintenance` },
          { label: t("createRequest") },
        ]}
      />

      {optionsLoading ? (
        <div className="flex items-center justify-center py-20" aria-busy="true">
          <Loader2 aria-hidden="true" className="h-5 w-5 text-accent animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-surface border border-border/40 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                name="unit_id"
                required
                label={`${t("table.unit")} *`}
                defaultValue={preselectedUnitId}
                placeholder={t("selectUnit")}
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.properties?.name ? `${unit.properties.name} - ` : ""}
                    {unit.unit_number}
                  </option>
                ))}
              </Select>

              <Select
                name="tenant_id"
                label={t("assignedTo")}
                placeholder={t("selectTenantOptional")}
                defaultValue=""
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.full_name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                name="category"
                required
                defaultValue="plumbing"
                label={`${t("category")} *`}
              >
                <option value="plumbing">{t("categories.plumbing")}</option>
                <option value="electrical">{t("categories.electrical")}</option>
                <option value="ac">{t("categories.ac")}</option>
                <option value="structural">{t("categories.structural")}</option>
                <option value="other">{t("categories.other")}</option>
              </Select>

              <Select
                name="urgency"
                required
                defaultValue="low"
                label={`${t("urgency")} *`}
              >
                <option value="low">{t("urgencies.low")}</option>
                <option value="medium">{t("urgencies.medium")}</option>
                <option value="high">{t("urgencies.high")}</option>
                <option value="emergency">{t("urgencies.emergency")}</option>
              </Select>
            </div>

            <Textarea
              name="description"
              required
              rows={4}
              label={`${t("description")} *`}
              placeholder={`${t("description")}…`}
            />
          </div>

          <div className="bg-surface border border-border/40 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-display font-semibold text-text-primary tracking-tight">
              {t("vendor")} ({tc("optional")})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="assigned_to_name"
                label={t("assignedTo")}
                placeholder={t("technicianName")}
              />
              <Input
                name="assigned_to_phone"
                label={t("vendorPhone")}
                placeholder={t("vendorPhonePlaceholder")}
                className="font-mono"
              />
            </div>

            <Input
              name="estimated_cost"
              type="number"
              min={0}
              step={0.01}
              label={`${t("estimatedCost")} (OMR)`}
              placeholder="0.00"
              className="font-mono"
            />
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20">
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
