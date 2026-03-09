"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewTenantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("tenants").insert({
      full_name: formData.get("full_name") as string,
      nationality: (formData.get("nationality") as string) || null,
      national_id: (formData.get("national_id") as string) || null,
      passport_number: (formData.get("passport_number") as string) || null,
      phone: formData.get("phone") as string,
      email: (formData.get("email") as string) || null,
      emergency_contact: (formData.get("emergency_contact") as string) || null,
      language_preference: formData.get("language_preference") as string,
      status: "active",
      created_by: user?.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    const { locale } = await params;
    router.push(`/${locale}/tenants`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          {t("createTenant")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("fullName")} <span className="text-destructive">*</span>
            </label>
            <input
              name="full_name"
              required
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder={t("fullNamePlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("nationality")}
              </label>
              <input
                name="nationality"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder={t("nationalityPlaceholder")}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("nationalId")}
              </label>
              <input
                name="national_id"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                placeholder={t("nationalIdPlaceholder")}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("passportNumber")}
            </label>
            <input
              name="passport_number"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
              placeholder={t("passportNumberPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("phone")} <span className="text-destructive">*</span>
              </label>
              <input
                name="phone"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                placeholder={t("phonePlaceholder")}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("email")}
              </label>
              <input
                name="email"
                type="email"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder={t("emailPlaceholder")}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("emergencyContact")}
            </label>
            <input
              name="emergency_contact"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder={t("emergencyContactPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("languagePreference")}
            </label>
            <select
              name="language_preference"
              defaultValue="en"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="en">{t("languages.en")}</option>
              <option value="ar">{t("languages.ar")}</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

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
