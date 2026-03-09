"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  useEffect(() => {
    const fetchOptions = async () => {
      const supabase = createClient();

      const { data: unitsData } = await supabase
        .from("units")
        .select("id, unit_number, properties:property_id(name)")
        .order("unit_number");

      const { data: tenantsData } = await supabase
        .from("tenants")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name");

      if (unitsData) setUnits(unitsData as unknown as UnitOption[]);
      if (tenantsData) setTenants(tenantsData as unknown as TenantOption[]);
    };

    fetchOptions();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload: Record<string, unknown> = {
      unit_id: formData.get("unit_id") as string,
      category: formData.get("category") as string,
      description: formData.get("description") as string,
      urgency: formData.get("urgency") as string,
      status: "open",
      created_by: user?.id,
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

    const { locale } = await params;
    router.push(`/${locale}/maintenance`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          New Maintenance Request
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Submit a new maintenance request for a unit
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                Unit <span className="text-destructive">*</span>
              </label>
              <select
                name="unit_id"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
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
              <label className="block text-sm text-text-secondary mb-1.5">
                Tenant
              </label>
              <select
                name="tenant_id"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">Select tenant (optional)...</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                Category <span className="text-destructive">*</span>
              </label>
              <select
                name="category"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="plumbing">Plumbing</option>
                <option value="electrical">Electrical</option>
                <option value="ac">AC / HVAC</option>
                <option value="structural">Structural</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                Urgency <span className="text-destructive">*</span>
              </label>
              <select
                name="urgency"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Description <span className="text-destructive">*</span>
            </label>
            <textarea
              name="description"
              required
              rows={4}
              className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder="Describe the maintenance issue..."
            />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-medium text-text-primary">
            Assignment (Optional)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                Assigned To (Name)
              </label>
              <input
                name="assigned_to_name"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder="Technician name"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                Phone
              </label>
              <input
                name="assigned_to_phone"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                placeholder="+968 XXXX XXXX"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Estimated Cost (OMR)
            </label>
            <input
              name="estimated_cost"
              type="number"
              min="0"
              step="0.01"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
              placeholder="0.00"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? tc("loading") : "Submit Request"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
