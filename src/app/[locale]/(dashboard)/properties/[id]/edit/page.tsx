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
} from "lucide-react";

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
  } | null>(null);

  useEffect(() => {
    const fetchProperty = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("properties")
        .select("name, location, total_units, property_type")
        .eq("id", id)
        .single();

      if (fetchError || !data) {
        setError(fetchError?.message || "Property not found");
        setFetching(false);
        return;
      }

      setInitialData({
        name: data.name || "",
        location: data.location || "",
        total_units: data.total_units || 0,
        property_type: data.property_type || "residential",
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
      setError("Property name is required");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const updateData = {
      name,
      location: (formData.get("location") as string)?.trim() || null,
      total_units: parseInt(formData.get("total_units") as string) || 0,
      property_type: formData.get("property_type") as string,
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
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
                name="name"
                required
                defaultValue={initialData?.name}
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl pl-10 pr-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 placeholder:text-text-secondary/40"
                placeholder={t("namePlaceholder")}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("location")}
            </label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
                name="location"
                defaultValue={initialData?.location}
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-xl pl-10 pr-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 placeholder:text-text-secondary/40"
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
