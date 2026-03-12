"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface Tenant {
  id: string;
  full_name: string;
  nationality: string | null;
  national_id: string | null;
  passport_number: string | null;
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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    const load = async () => {
      const { id } = await params;
      const supabase = createClient();
      const { data } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single();
      if (data) setTenant(data as Tenant);
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
        passport_number: (formData.get("passport_number") as string) || null,
        phone: formData.get("phone") as string,
        email: (formData.get("email") as string) || null,
        emergency_contact: (formData.get("emergency_contact") as string) || null,
        language_preference: formData.get("language_preference") as string,
        status: formData.get("status") as string,
      })
      .eq("id", tenant.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
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
        <h1 className="text-2xl font-semibold text-text-primary">
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

          {/* Passport Number */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("passportNumber")}
            </label>
            <input
              name="passport_number"
              defaultValue={tenant.passport_number || ""}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
            />
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
