"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Building2, Home } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

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
  const [nameError, setNameError] = useState("");
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
      <div className="mx-auto max-w-2xl">
        <Spinner className="py-20" label={tc("loading")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t("editProperty")}
        description={t("subtitle")}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/properties` },
          { label: t("editProperty") },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Property name + location + units */}
        <Card className="animate-fade-in-up">
          <CardHeader className="pb-5">
            <CardTitle className="text-base">{t("details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Input
              name="name"
              required
              defaultValue={initialData?.name}
              label={`${t("name")} *`}
              placeholder={t("namePlaceholder")}
              error={nameError}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                name="location"
                defaultValue={initialData?.location}
                label={t("location")}
                placeholder={t("locationPlaceholder")}
              />
              <Input
                name="total_units"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={initialData?.total_units}
                label={t("totalUnits")}
                placeholder="0"
                className="font-mono tabular-nums"
              />
            </div>
          </CardContent>
        </Card>

        {/* Move-out fee defaults */}
        <Card className="animate-fade-in-up">
          <CardHeader className="pb-5">
            <CardTitle className="text-base">
              {t("moveOutDefaults.title")}
            </CardTitle>
            <CardDescription>
              {t("moveOutDefaults.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Input
              name="code"
              defaultValue={initialData?.code}
              maxLength={12}
              label={t("moveOutDefaults.code")}
              placeholder={t("moveOutDefaults.codePlaceholder")}
              helperText={t("moveOutDefaults.codeHint")}
              className="font-mono uppercase tracking-wider"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                name="cleaning_fee_default"
                type="number"
                min={0}
                step={0.01}
                defaultValue={initialData?.cleaning_fee_default}
                label={`${t("moveOutDefaults.cleaningFee")} (${CURRENCY.code})`}
                placeholder="0.00"
                className="font-mono tabular-nums"
              />
              <Input
                name="painting_fee_default"
                type="number"
                min={0}
                step={0.01}
                defaultValue={initialData?.painting_fee_default}
                label={`${t("moveOutDefaults.paintingFee")} (${CURRENCY.code})`}
                placeholder="0.00"
                className="font-mono tabular-nums"
              />
            </div>
            <Input
              name="early_termination_rate"
              type="number"
              min={0}
              max={100}
              step={0.01}
              defaultValue={
                initialData
                  ? (parseFloat(initialData.early_termination_rate) * 100).toFixed(2)
                  : "12"
              }
              label={`${t("moveOutDefaults.earlyTerminationRate")} (%)`}
              placeholder="12.00"
              helperText={t("moveOutDefaults.earlyTerminationHint")}
              className="font-mono tabular-nums"
            />
          </CardContent>
        </Card>

        {/* Property type selector */}
        <Card className="animate-fade-in-up">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">{t("propertyType")}</CardTitle>
          </CardHeader>
          <CardContent>
            <input type="hidden" name="property_type" value={selectedType} />
            <div
              role="group"
              aria-label={t("propertyType")}
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {propertyTypes.map((pt) => {
                const Icon = pt.icon;
                const isActive = selectedType === pt.value;
                return (
                  <button
                    key={pt.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setSelectedType(pt.value)}
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-4 text-xs font-medium transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive
                        ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                        : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:bg-surface-elevated hover:text-text-primary"
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
          </CardContent>
        </Card>

        {/* Form-level error */}
        {error && <Alert variant="destructive">{error}</Alert>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={loading}>
            {loading ? tc("loading") : tc("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
