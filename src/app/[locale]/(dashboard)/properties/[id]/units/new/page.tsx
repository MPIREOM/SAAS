"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";
import {
  ArrowLeft,
  Home,
  Hash,
  Layers,
  Ruler,
  Banknote,
  Loader2,
} from "lucide-react";

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

  const unitTypes = [
    "studio",
    "1br",
    "2br",
    "3br",
    "4br",
    "penthouse",
    "office",
    "shop",
    "warehouse",
  ];

  const [selectedType, setSelectedType] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const unitNumber = (formData.get("unit_number") as string)?.trim();

    if (!unitNumber) {
      setError("Unit number is required");
      setLoading(false);
      return;
    }

    const rentAmount = parseFloat(formData.get("rent_amount") as string);
    if (!rentAmount || rentAmount <= 0) {
      setError("Rent amount must be greater than 0");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { locale, id: propertyId } = await params;

    const { error: insertError } = await supabase.from("units").insert({
      property_id: propertyId,
      unit_number: unitNumber,
      floor: parseInt(formData.get("floor") as string) || null,
      unit_type: selectedType || null,
      size_sqm: parseFloat(formData.get("size_sqm") as string) || null,
      rent_amount: rentAmount,
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
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary font-display tracking-tight">
              {t("addUnit")}
            </h1>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Unit Details */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
          {/* Unit Number */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("unitNumber")} <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
                name="unit_number"
                required
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl pl-10 pr-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 font-mono placeholder:text-text-secondary/40"
                placeholder={t("unitNumberPlaceholder")}
              />
            </div>
          </div>

          {/* Floor & Size */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                {t("floor")}
              </label>
              <div className="relative">
                <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
                <input
                  name="floor"
                  type="number"
                  className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl pl-10 pr-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 font-mono tabular-nums placeholder:text-text-secondary/40"
                  placeholder={t("floorPlaceholder")}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                {t("sizeSqm")}
              </label>
              <div className="relative">
                <Ruler className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
                <input
                  name="size_sqm"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl pl-10 pr-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 font-mono tabular-nums placeholder:text-text-secondary/40"
                  placeholder={t("sizePlaceholder")}
                />
              </div>
            </div>
          </div>

          {/* Rent Amount */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("rentAmount")} <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Banknote className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
                name="rent_amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl pl-10 pr-16 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 font-mono tabular-nums placeholder:text-text-secondary/40"
                placeholder={t("rentPlaceholder")}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-text-secondary">
                {CURRENCY.code}
              </span>
            </div>
          </div>
        </div>

        {/* Unit Type Selector */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            {t("unitType")}
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {unitTypes.map((type) => {
              const isActive = selectedType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setSelectedType(isActive ? "" : type)
                  }
                  className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                      : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                  }`}
                >
                  <Home
                    className={`h-3.5 w-3.5 ${
                      isActive ? "text-accent" : "text-text-secondary/60"
                    }`}
                  />
                  {t(`types.${type}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="h-10 px-6 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-40 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98] flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tc("loading")}
              </>
            ) : (
              tc("save")
            )}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-10 px-5 bg-surface-elevated border border-border/60 text-text-primary text-sm font-medium rounded-xl hover:bg-surface-hover transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
