"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewPropertyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = useTranslations("properties");
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

    const { error: insertError } = await supabase.from("properties").insert({
      name: formData.get("name") as string,
      location: formData.get("location") as string,
      total_units: parseInt(formData.get("total_units") as string) || 0,
      property_type: formData.get("property_type") as string,
      created_by: user?.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    const { locale } = await params;
    router.push(`/${locale}/properties`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          {t("createProperty")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("name")} <span className="text-destructive">*</span>
            </label>
            <input
              name="name"
              required
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder={t("namePlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("location")}
            </label>
            <input
              name="location"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder={t("locationPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("totalUnits")}
              </label>
              <input
                name="total_units"
                type="number"
                min="0"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("propertyType")}
              </label>
              <select
                name="property_type"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="residential">{t("types.residential")}</option>
                <option value="commercial">{t("types.commercial")}</option>
                <option value="mixed">{t("types.mixed")}</option>
                <option value="industrial">{t("types.industrial")}</option>
              </select>
            </div>
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
