"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

const unitCategories = ["penthouse", "office", "shop", "warehouse"];
const unitStatuses = ["vacant", "occupied", "maintenance"];

export default function EditUnitPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const propertyId = params.id as string;
  const unitId = params.unitId as string;
  const t = useTranslations("units");
  const tp = useTranslations("properties");
  const tc = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [unitNumber, setUnitNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [unitType, setUnitType] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [sizeSqm, setSizeSqm] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [status, setStatus] = useState("vacant");

  useEffect(() => {
    async function fetchUnit() {
      const supabase = createClient();

      // Verify the unit belongs to the expected property
      const { data, error } = await supabase
        .from("units")
        .select("*")
        .eq("id", unitId)
        .eq("property_id", propertyId)
        .single();

      if (error || !data) {
        setError("Unit not found");
        setLoading(false);
        return;
      }

      setUnitNumber(data.unit_number || "");
      setFloor(data.floor?.toString() || "");
      setUnitType(data.unit_type || "");
      setBedrooms(data.bedrooms?.toString() ?? "");
      setSizeSqm(data.size_sqm?.toString() || "");
      setRentAmount(data.rent_amount?.toString() || "");
      setStatus(data.status || "vacant");
      setLoading(false);
    }
    fetchUnit();
  }, [unitId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!unitNumber || !rentAmount) {
      setError(tc("required"));
      return;
    }
    if (parseFloat(rentAmount) <= 0) {
      setError("Rent amount must be greater than 0");
      return;
    }

    setSaving(true);
    setError("");

    const supabase = createClient();
    const payload: Record<string, unknown> = {
      unit_number: unitNumber,
      rent_amount: parseFloat(rentAmount),
      status,
    };
    if (floor !== "") payload.floor = parseInt(floor);
    if (unitType) payload.unit_type = unitType;
    payload.bedrooms = bedrooms !== "" ? parseInt(bedrooms) : null;
    if (sizeSqm) payload.size_sqm = parseFloat(sizeSqm);

    const { error: updateError } = await supabase
      .from("units")
      .update(payload)
      .eq("id", unitId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    router.push(`/${locale}/properties/${propertyId}`);
    router.refresh();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Spinner className="py-20" label={tc("loading")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t("editUnit")}
        breadcrumbs={[
          { label: tp("title"), href: `/${locale}/properties` },
          { label: tp("details"), href: `/${locale}/properties/${propertyId}` },
          { label: t("editUnit") },
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
              type="text"
              required
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              label={`${t("unitNumber")} *`}
              placeholder={t("unitNumberPlaceholder")}
              className="font-mono"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="number"
                inputMode="numeric"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                label={t("floor")}
                placeholder={t("floorPlaceholder")}
                className="font-mono tabular-nums"
              />
              <Input
                type="number"
                step={0.01}
                value={sizeSqm}
                onChange={(e) => setSizeSqm(e.target.value)}
                label={t("sizeSqm")}
                placeholder={t("sizePlaceholder")}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="number"
                step={0.01}
                min={0.01}
                required
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                label={`${t("rentAmount")} (${CURRENCY.code}) *`}
                placeholder={t("rentPlaceholder")}
                className="font-mono tabular-nums"
              />
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                label={t("status")}
              >
                {unitStatuses.map((s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ))}
              </Select>
            </div>
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
            <Select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              label={t("unitCategory")}
              helperText={t("unitCategoryHint")}
            >
              <option value="">{t("noneResidential")}</option>
              {unitCategories.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </Select>
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
          <Button type="submit" loading={saving}>
            {saving ? tc("loading") : tc("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
