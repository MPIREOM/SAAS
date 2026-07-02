"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";
import { Home } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export default function NewUnitPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = use(params);
  const t = useTranslations("units");
  const tp = useTranslations("properties");
  const tc = useTranslations("common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unitNumberError, setUnitNumberError] = useState("");
  const [rentError, setRentError] = useState("");

  const unitCategories = ["penthouse", "office", "shop", "warehouse"];

  const [selectedType, setSelectedType] = useState("");
  const [bedrooms, setBedrooms] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setUnitNumberError("");
    setRentError("");

    const formData = new FormData(e.currentTarget);
    const unitNumber = (formData.get("unit_number") as string)?.trim();

    if (!unitNumber) {
      setUnitNumberError("Unit number is required");
      setLoading(false);
      return;
    }

    const rentAmount = parseFloat(formData.get("rent_amount") as string);
    if (!rentAmount || rentAmount <= 0) {
      setRentError("Rent amount must be greater than 0");
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
      bedrooms: bedrooms !== "" ? parseInt(bedrooms) : null,
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t("addUnit")}
        breadcrumbs={[
          { label: tp("title"), href: `/${locale}/properties` },
          { label: tp("details"), href: `/${locale}/properties/${id}` },
          { label: t("addUnit") },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Unit details */}
        <Card className="animate-fade-in-up">
          <CardHeader className="pb-5">
            <CardTitle className="text-base">{t("unitInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Input
              name="unit_number"
              required
              label={`${t("unitNumber")} *`}
              placeholder={t("unitNumberPlaceholder")}
              error={unitNumberError}
              className="font-mono"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                name="floor"
                type="number"
                inputMode="numeric"
                label={t("floor")}
                placeholder={t("floorPlaceholder")}
                className="font-mono tabular-nums"
              />
              <Input
                name="size_sqm"
                type="number"
                step={0.01}
                min={0}
                label={t("sizeSqm")}
                placeholder={t("sizePlaceholder")}
                className="font-mono tabular-nums"
              />
            </div>
            <Input
              name="rent_amount"
              type="number"
              step={0.01}
              min={0.01}
              required
              label={`${t("rentAmount")} (${CURRENCY.code}) *`}
              placeholder={t("rentPlaceholder")}
              error={rentError}
              className="font-mono tabular-nums"
            />
          </CardContent>
        </Card>

        {/* Bedrooms & category */}
        <Card className="animate-fade-in-up">
          <CardHeader className="pb-5">
            <CardTitle className="text-base">{t("type")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={bedrooms}
              onChange={(e) => setBedrooms(e.target.value)}
              label={t("bedrooms")}
              placeholder={t("bedroomsPlaceholder")}
              helperText={t("bedroomsHint")}
              className="font-mono tabular-nums"
            />

            {/* Unit category chip group (toggle — click again to clear) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium tracking-tight text-foreground">
                {t("unitCategory")}
              </span>
              <div
                role="group"
                aria-label={t("unitCategory")}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {unitCategories.map((type) => {
                  const isActive = selectedType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() =>
                        setSelectedType(isActive ? "" : type)
                      }
                      className={cn(
                        "flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all duration-200",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isActive
                          ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                          : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:bg-surface-elevated hover:text-text-primary"
                      )}
                    >
                      <Home
                        aria-hidden="true"
                        className={cn(
                          "h-3.5 w-3.5",
                          isActive ? "text-accent" : "text-text-secondary/60"
                        )}
                      />
                      {t(`types.${type}`)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-text-secondary">
                {t("unitCategoryHint")}
              </p>
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
