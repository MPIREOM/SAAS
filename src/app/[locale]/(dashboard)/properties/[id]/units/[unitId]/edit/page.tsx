"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Home, Layers, Ruler, DollarSign, ArrowLeft } from "lucide-react";

const unitTypes = ["studio", "1br", "2br", "3br", "4br", "penthouse", "office", "shop", "warehouse"];
const unitStatuses = ["vacant", "occupied", "maintenance"];

export default function EditUnitPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const propertyId = params.id as string;
  const unitId = params.unitId as string;
  const t = useTranslations("units");
  const tc = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [unitNumber, setUnitNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [unitType, setUnitType] = useState("");
  const [sizeSqm, setSizeSqm] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [status, setStatus] = useState("vacant");

  useEffect(() => {
    async function fetchUnit() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("units")
        .select("*")
        .eq("id", unitId)
        .single();

      if (error || !data) {
        setError("Unit not found");
        setLoading(false);
        return;
      }

      setUnitNumber(data.unit_number || "");
      setFloor(data.floor?.toString() || "");
      setUnitType(data.unit_type || "");
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

    setSaving(true);
    setError("");

    const supabase = createClient();
    const payload: Record<string, unknown> = {
      unit_number: unitNumber,
      rent_amount: parseFloat(rentAmount),
      status,
    };
    if (floor) payload.floor = parseInt(floor);
    if (unitType) payload.unit_type = unitType;
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">{t("editUnit")}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-6 space-y-5">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Unit Number */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">{t("unitNumber")} *</label>
          <div className="relative">
            <Home className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <input
              type="text"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              className="w-full ps-10 pe-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder={t("unitNumberPlaceholder")}
              required
            />
          </div>
        </div>

        {/* Floor */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">{t("floor")}</label>
          <div className="relative">
            <Layers className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <input
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              className="w-full ps-10 pe-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder={t("floorPlaceholder")}
            />
          </div>
        </div>

        {/* Unit Type */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">{t("unitType")}</label>
          <select
            value={unitType}
            onChange={(e) => setUnitType(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="">{t("selectType")}</option>
            {unitTypes.map((type) => (
              <option key={type} value={type}>{t(`types.${type}`)}</option>
            ))}
          </select>
        </div>

        {/* Size */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">{t("sizeSqm")}</label>
          <div className="relative">
            <Ruler className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <input
              type="number"
              step="0.01"
              value={sizeSqm}
              onChange={(e) => setSizeSqm(e.target.value)}
              className="w-full ps-10 pe-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder={t("sizePlaceholder")}
            />
          </div>
        </div>

        {/* Rent Amount */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">{t("rentAmount")} *</label>
          <div className="relative">
            <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <input
              type="number"
              step="0.01"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
              className="w-full ps-10 pe-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder={t("rentPlaceholder")}
              required
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">{t("status")}</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            {unitStatuses.map((s) => (
              <option key={s} value={s}>{t(s)}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-6 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? tc("loading") : tc("save")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-10 px-6 bg-surface-elevated border border-border text-text-secondary text-sm font-medium rounded-lg hover:text-text-primary transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
