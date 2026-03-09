"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewUnitPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const t = useTranslations("units");
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
    const { locale, id: propertyId } = await params;

    const { error: insertError } = await supabase.from("units").insert({
      property_id: propertyId,
      unit_number: formData.get("unit_number") as string,
      floor: parseInt(formData.get("floor") as string) || null,
      unit_type: (formData.get("unit_type") as string) || null,
      size_sqm: parseFloat(formData.get("size_sqm") as string) || null,
      rent_amount: parseFloat(formData.get("rent_amount") as string) || 0,
      status: "vacant",
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/${locale}/properties/${propertyId}`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          {t("addUnit")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("unitNumber")} <span className="text-destructive">*</span>
            </label>
            <input
              name="unit_number"
              required
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
              placeholder={t("unitNumberPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("floor")}
              </label>
              <input
                name="floor"
                type="number"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                placeholder={t("floorPlaceholder")}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("unitType")}
              </label>
              <select
                name="unit_type"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">{t("selectType")}</option>
                <option value="studio">{t("types.studio")}</option>
                <option value="1br">{t("types.1br")}</option>
                <option value="2br">{t("types.2br")}</option>
                <option value="3br">{t("types.3br")}</option>
                <option value="4br">{t("types.4br")}</option>
                <option value="penthouse">{t("types.penthouse")}</option>
                <option value="office">{t("types.office")}</option>
                <option value="shop">{t("types.shop")}</option>
                <option value="warehouse">{t("types.warehouse")}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("sizeSqm")}
              </label>
              <input
                name="size_sqm"
                type="number"
                step="0.01"
                min="0"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                placeholder={t("sizePlaceholder")}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("rentAmount")} <span className="text-destructive">*</span>
              </label>
              <input
                name="rent_amount"
                type="number"
                step="0.01"
                min="0"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                placeholder={t("rentPlaceholder")}
              />
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
