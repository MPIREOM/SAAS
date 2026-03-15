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
            .from("user_property_access")
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
              <select
                name="status"
                defaultValue={tenant.status}
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="active">{t("active")}</option>
                <option value="archived">{t("archived")}</option>
              </select>
            </div>
          </div>
        </div>

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
