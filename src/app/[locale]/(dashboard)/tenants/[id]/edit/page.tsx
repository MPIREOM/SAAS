"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { FileText } from "lucide-react";
import {
  ChequeFormRows,
  ChequeEntry,
} from "@/components/cheques/cheque-form-rows";

interface Tenant {
  id: string;
  full_name: string;
  nationality: string | null;
  national_id: string | null;
  phone: string;
  email: string | null;
  emergency_contact: string | null;
  language_preference: string;
  status: string;
}

interface Lease {
  id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  payment_due_day: number;
  is_active: boolean;
  unit_number: string;
  property_name: string;
}

export default function EditTenantPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const tch = useTranslations("cheques");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [cheques, setCheques] = useState<ChequeEntry[]>([]);
  const [chequesLoaded, setChequesLoaded] = useState(false);
  const [leases, setLeases] = useState<Lease[]>([]);

  useEffect(() => {
    const load = async () => {
      const { id } = await params;
      const supabase = createClient();

      // Load tenant
      const { data } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single();
      if (data) setTenant(data as Tenant);

      // Access control check
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
        if (profile?.role !== "super_admin") {
          const { data: access } = await supabase
            .from("user_property_assignments")
            .select("property_id")
            .eq("user_id", user.id);
          const { data: leases } = await supabase
            .from("leases")
            .select("units(property_id)")
            .eq("tenant_id", id)
            .limit(1);
          const propId = (leases?.[0]?.units as unknown as { property_id: string })?.property_id;
          if (propId && access && !access.some(a => a.property_id === propId)) {
            const { locale } = await params;
            router.push(`/${locale}/tenants`);
            return;
          }
        }
      }

      // Load leases
      const { data: leaseData } = await supabase
        .from("leases")
        .select("id, start_date, end_date, monthly_rent, security_deposit, payment_due_day, is_active, units(unit_number, properties:property_id(name))")
        .eq("tenant_id", id)
        .order("is_active", { ascending: false })
        .order("start_date", { ascending: false });

      if (leaseData) {
        setLeases(
          leaseData.map((l) => {
            const unit = l.units as unknown as Record<string, unknown> | null;
            const prop = unit?.properties as unknown as Record<string, unknown> | null;
            return {
              id: l.id,
              start_date: l.start_date,
              end_date: l.end_date,
              monthly_rent: l.monthly_rent,
              security_deposit: l.security_deposit,
              payment_due_day: l.payment_due_day || 1,
              is_active: l.is_active,
              unit_number: (unit?.unit_number as string) || "",
              property_name: (prop?.name as string) || "",
            };
          })
        );
      }

      // Load existing cheques
      const { data: existingCheques } = await supabase
        .from("cheques")
        .select("id, cheque_number, bank_name, cheque_date, amount, status")
        .eq("tenant_id", id)
        .order("cheque_date", { ascending: true });

      if (existingCheques) {
        setCheques(
          existingCheques.map((c) => ({
            id: c.id,
            cheque_number: c.cheque_number,
            bank_name: c.bank_name,
            cheque_date: c.cheque_date,
            amount: String(c.amount),
            status: c.status,
          }))
        );
      }
      setChequesLoaded(true);
    };
    load();
  }, [params]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tenant) return;
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        full_name: formData.get("full_name") as string,
        nationality: (formData.get("nationality") as string) || null,
        national_id: (formData.get("national_id") as string) || null,
        phone: formData.get("phone") as string,
        email: (formData.get("email") as string) || null,
        emergency_contact:
          (formData.get("emergency_contact") as string) || null,
        language_preference: formData.get("language_preference") as string,
        status: formData.get("status") as string,
      })
      .eq("id", tenant.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    logAudit(supabase, {
      action: "update",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { full_name: formData.get("full_name") as string },
    });

    // Validate leases
    for (const lease of leases) {
      if (lease.start_date && lease.end_date && lease.end_date <= lease.start_date) {
        setError(`Lease for ${lease.unit_number}: end date must be after start date`);
        setLoading(false);
        return;
      }
      if (lease.monthly_rent !== undefined && lease.monthly_rent <= 0) {
        setError(`Lease for ${lease.unit_number}: monthly rent must be greater than 0`);
        setLoading(false);
        return;
      }
    }

    // Update leases
    for (const lease of leases) {
      const { error: leaseError } = await supabase
        .from("leases")
        .update({
          start_date: lease.start_date,
          end_date: lease.end_date,
          monthly_rent: lease.monthly_rent,
          security_deposit: lease.security_deposit,
          payment_due_day: lease.payment_due_day,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lease.id);

      if (leaseError) {
        setError(leaseError.message);
        setLoading(false);
        return;
      }
    }

    // Insert only new cheques (ones without an id)
    const newCheques = cheques.filter(
      (c) => !c.id && c.cheque_number && c.bank_name && c.cheque_date && c.amount
    );
    if (newCheques.length > 0) {
      const { error: chequeError } = await supabase.from("cheques").insert(
        newCheques.map((c) => ({
          tenant_id: tenant.id,
          cheque_number: c.cheque_number,
          bank_name: c.bank_name,
          cheque_date: c.cheque_date,
          amount: c.amount,
          status: "pending" as const,
        }))
      );

      if (chequeError) {
        setError(chequeError.message);
        setLoading(false);
        return;
      }
    }

    const { locale } = await params;
    router.push(`/${locale}/tenants/${tenant.id}`);
    router.refresh();
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary font-display">
          {t("editTenant")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("fullName")} <span className="text-destructive">*</span>
            </label>
            <input
              name="full_name"
              required
              defaultValue={tenant.full_name}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("phone")} <span className="text-destructive">*</span>
              </label>
              <input
                name="phone"
                required
                defaultValue={tenant.phone}
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("email")}
              </label>
              <input
                name="email"
                type="email"
                defaultValue={tenant.email || ""}
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          {/* Nationality & National ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("nationality")}
              </label>
              <input
                name="nationality"
                defaultValue={tenant.nationality || ""}
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("nationalId")}
              </label>
              <input
                name="national_id"
                defaultValue={tenant.national_id || ""}
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
              />
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("emergencyContact")}
            </label>
            <input
              name="emergency_contact"
              defaultValue={tenant.emergency_contact || ""}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Language & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("languagePreference")}
              </label>
              <select
                name="language_preference"
                defaultValue={tenant.language_preference}
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="en">{t("languages.en")}</option>
                <option value="ar">{t("languages.ar")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("status")}
              </label>
              <input
                type="text"
                name="status"
                value={tenant.status}
                readOnly
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-secondary focus:outline-none cursor-not-allowed capitalize"
              />
              <p className="text-xs text-text-secondary mt-1">Use the move-out flow to archive a tenant</p>
            </div>
          </div>
        </div>

        {/* Lease Section */}
        {leases.length > 0 && (
          <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" />
              {t("leaseInfo")}
            </h2>
            {leases.map((lease, idx) => (
              <div
                key={lease.id}
                className="border border-border rounded-md p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    {lease.property_name} — {t("unit")} {lease.unit_number}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      lease.is_active
                        ? "bg-success/10 text-success"
                        : "bg-text-secondary/10 text-text-secondary"
                    }`}
                  >
                    {lease.is_active ? t("leaseActive") : t("leaseExpired")}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("startDate")}
                    </label>
                    <input
                      type="date"
                      value={lease.start_date}
                      onChange={(e) => {
                        const updated = [...leases];
                        updated[idx] = { ...updated[idx], start_date: e.target.value };
                        setLeases(updated);
                      }}
                      className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("endDate")}
                    </label>
                    <input
                      type="date"
                      value={lease.end_date}
                      onChange={(e) => {
                        const updated = [...leases];
                        updated[idx] = { ...updated[idx], end_date: e.target.value };
                        setLeases(updated);
                      }}
                      className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("monthlyRent")}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={lease.monthly_rent}
                      onChange={(e) => {
                        const updated = [...leases];
                        updated[idx] = { ...updated[idx], monthly_rent: Number(e.target.value) };
                        setLeases(updated);
                      }}
                      className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("securityDeposit")}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={lease.security_deposit || ""}
                      onChange={(e) => {
                        const updated = [...leases];
                        updated[idx] = { ...updated[idx], security_deposit: e.target.value ? Number(e.target.value) : null };
                        setLeases(updated);
                      }}
                      className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("paymentDueDay")}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={lease.payment_due_day}
                      onChange={(e) => {
                        const updated = [...leases];
                        updated[idx] = { ...updated[idx], payment_due_day: Number(e.target.value) };
                        setLeases(updated);
                      }}
                      className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cheques Section */}
        {chequesLoaded && (
          <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <h2 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" />
              {tch("title")}
              {cheques.filter((c) => c.id).length > 0 && (
                <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
                  {cheques.filter((c) => c.id).length}
                </span>
              )}
            </h2>
            <p className="text-xs text-text-secondary">
              {tch("subtitle")}
            </p>
            <ChequeFormRows
              cheques={cheques}
              onChange={setCheques}
              showStatus
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? tc("loading") : tc("save")}
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
