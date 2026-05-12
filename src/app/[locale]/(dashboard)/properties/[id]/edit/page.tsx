"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Home,
  Loader2,
  Hash,
  LogOut,
} from "lucide-react";
import { CURRENCY } from "@/lib/currency";

export default function EditPropertyPage() {
  const t = useTranslations("properties");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const locale = params.locale as string;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [selectedType, setSelectedType] = useState("residential");
  const [initialData, setInitialData] = useState<{
    name: string;
    location: string;
    total_units: number;
    property_type: string;
    code: string;
    cleaning_fee_default: string;
    painting_fee_default: string;
    early_termination_rate: string;
  } | null>(null);

  useEffect(() => {
    const fetchProperty = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("properties")
        .select("name, location, total_units, property_type, code, cleaning_fee_default, painting_fee_default, early_termination_rate")
        .eq("id", id)
        .single();

      if (fetchError || !data) {
        setError(fetchError?.message || t("notFound"));
        setFetching(false);
        return;
      }

      setInitialData({
        name: data.name || "",
        location: data.location || "",
        total_units: data.total_units || 0,
        property_type: data.property_type || "residential",
        code: data.code || "",
        cleaning_fee_default: String(data.cleaning_fee_default ?? "0"),
        painting_fee_default: String(data.painting_fee_default ?? "0"),
        early_termination_rate: String(data.early_termination_rate ?? "0.12"),
      });
      setSelectedType(data.property_type || "residential");
      setFetching(false);
    };

    fetchProperty();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = (formData.get("name") as string).trim();

    if (!name) {
      setError(t("nameRequired"));
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const code = (formData.get("code") as string)?.trim().toUpperCase() || null;
    const earlyTerminationPercent = parseFloat(
      (formData.get("early_termination_rate") as string) || "0",
    );

    const updateData = {
      name,
      location: (formData.get("location") as string)?.trim() || null,
      total_units: parseInt(formData.get("total_units") as string) || 0,
      property_type: formData.get("property_type") as string,
      code,
      cleaning_fee_default: parseFloat((formData.get("cleaning_fee_default") as string) || "0") || 0,
      painting_fee_default: parseFloat((formData.get("painting_fee_default") as string) || "0") || 0,
      // UI takes a percentage (0–100); store as a decimal rate (0–1)
      early_termination_rate: isFinite(earlyTerminationPercent)
        ? Math.max(0, Math.min(100, earlyTerminationPercent)) / 100
        : 0,
    };

    const { error: updateError } = await supabase
      .from("properties")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    try {
      await supabase.from("audit_logs").insert({
        user_id: user?.id,
        action: "update_property",
        entity_type: "property",
        entity_id: id,
        details: updateData,
      });
    } catch {
      // audit_logs table may not exist
    }

    router.push(`/${locale}/properties/${id}`);
    router.refresh();
  };

  const propertyTypes = [
    { value: "residential", icon: Home },
    { value: "commercial", icon: Building2 },
    { value: "mixed", icon: Building2 },
    { value: "industrial", icon: Building2 },
  ];

  if (fetching) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
      </div>
    );
  }

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
              {t("editProperty")}
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Property Name */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("name")} <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
                name="name"
                required
                defaultValue={initialData?.name}
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl ps-10 pe-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 placeholder:text-text-secondary/40"
                placeholder={t("namePlaceholder")}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("location")}
            </label>
            <div className="relative">
              <MapPin className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
                name="location"
                defaultValue={initialData?.location}
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl ps-10 pe-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 placeholder:text-text-secondary/40"
                placeholder={t("locationPlaceholder")}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("totalUnits")}
            </label>
            <input
              name="total_units"
              type="number"
              min="0"
              defaultValue={initialData?.total_units}
              className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl px-3.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 font-mono tabular-nums placeholder:text-text-secondary/40"
              placeholder="0"
            />
          </div>
        </div>

        {/* Move-out fee defaults */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-text-secondary" />
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              {t("moveOutDefaults.title")}
            </h3>
          </div>
          <p className="text-xs text-text-secondary -mt-2">
            {t("moveOutDefaults.description")}
          </p>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("moveOutDefaults.code")}
            </label>
            <div className="relative">
              <Hash className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
                name="code"
                defaultValue={initialData?.code}
                maxLength={12}
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl ps-10 pe-3 text-sm text-text-primary uppercase font-mono tracking-wider focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 placeholder:text-text-secondary/40"
                placeholder={t("moveOutDefaults.codePlaceholder")}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-text-secondary">
              {t("moveOutDefaults.codeHint")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                {t("moveOutDefaults.cleaningFee")} ({CURRENCY.code})
              </label>
              <input
                name="cleaning_fee_default"
                type="number"
                min="0"
                step="0.01"
                defaultValue={initialData?.cleaning_fee_default}
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl px-3.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 font-mono tabular-nums placeholder:text-text-secondary/40"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                {t("moveOutDefaults.paintingFee")} ({CURRENCY.code})
              </label>
              <input
                name="painting_fee_default"
                type="number"
                min="0"
                step="0.01"
                defaultValue={initialData?.painting_fee_default}
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl px-3.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 font-mono tabular-nums placeholder:text-text-secondary/40"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("moveOutDefaults.earlyTerminationRate")} (%)
            </label>
            <input
              name="early_termination_rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={
                initialData
                  ? (parseFloat(initialData.early_termination_rate) * 100).toFixed(2)
                  : "12"
              }
              className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl px-3.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 font-mono tabular-nums placeholder:text-text-secondary/40"
              placeholder="12.00"
            />
            <p className="mt-1.5 text-[11px] text-text-secondary">
              {t("moveOutDefaults.earlyTerminationHint")}
            </p>
          </div>
        </div>

        {/* Property Type Selector */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            {t("propertyType")}
          </label>
          <input type="hidden" name="property_type" value={selectedType} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {propertyTypes.map((pt) => {
              const Icon = pt.icon;
              const isActive = selectedType === pt.value;
              return (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setSelectedType(pt.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                      : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${
                      isActive ? "text-accent" : "text-text-secondary"
                    }`}
                  />
                  {t(`types.${pt.value}`)}
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
