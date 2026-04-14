"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Building2, Home, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export default function NewPropertyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  const t = useTranslations("properties");
  const tc = useTranslations("common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [selectedType, setSelectedType] = useState("residential");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNameError("");

    const formData = new FormData(e.currentTarget);
    const name = (formData.get("name") as string).trim();

    if (!name) {
      setNameError(t("nameRequired"));
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("properties").insert({
      name,
      location: (formData.get("location") as string)?.trim() || null,
      total_units: parseInt(formData.get("total_units") as string) || 0,
      property_type: formData.get("property_type") as string,
      created_by: user?.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/${locale}/properties`);
    router.refresh();
  };

  // Property-type chip group — kept as a custom toggle group instead of a
  // native <select> because the icons make it scannable and there are
  // only four options.
  const propertyTypes = [
    { value: "residential", icon: Home },
    { value: "commercial", icon: Building2 },
    { value: "mixed", icon: Building2 },
    { value: "industrial", icon: Building2 },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={t("createProperty")}
        description={t("subtitle")}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/properties` },
          { label: t("createProperty") },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Property Name + location + units */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <Input
            name="name"
            required
            label={t("name")}
            placeholder={t("namePlaceholder")}
            error={nameError}
          />
          <Input
            name="location"
            label={t("location")}
            placeholder={t("locationPlaceholder")}
          />
          <Input
            name="total_units"
            type="number"
            min={0}
            label={t("totalUnits")}
            placeholder="0"
            className="font-mono tabular-nums"
          />
        </div>

        {/* Property Type Selector */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <span className="block text-sm font-medium text-foreground tracking-tight mb-3">
            {t("propertyType")}
          </span>
          <input type="hidden" name="property_type" value={selectedType} />
          <div role="radiogroup" aria-label={t("propertyType")} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {propertyTypes.map((pt) => {
              const Icon = pt.icon;
              const isActive = selectedType === pt.value;
              return (
                <button
                  key={pt.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setSelectedType(pt.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    isActive
                      ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                      : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "h-5 w-5",
                      isActive ? "text-accent" : "text-text-secondary"
                    )}
                  />
                  {t(`types.${pt.value}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" loading={loading}>
            {loading ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                {tc("loading")}
              </>
            ) : (
              tc("save")
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
