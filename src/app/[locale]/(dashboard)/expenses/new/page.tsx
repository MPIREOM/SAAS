"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Upload } from "lucide-react";

interface PropertyOption {
  id: string;
  name: string;
}

interface UnitOption {
  id: string;
  unit_number: string;
  property_id: string;
}

export default function NewExpensePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("expenses");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [allUnits, setAllUnits] = useState<UnitOption[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<UnitOption[]>([]);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [locale, setLocale] = useState("en");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  useEffect(() => {
    params.then((p) => setLocale(p.locale));
  }, [params]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const supabase = createClient();
        const [propsRes, unitsRes] = await Promise.all([
          supabase.from("properties").select("id, name").order("name"),
          supabase.from("units").select("id, unit_number, property_id").order("unit_number"),
        ]);
        if (propsRes.data) setProperties(propsRes.data as PropertyOption[]);
        if (unitsRes.data) setAllUnits(unitsRes.data as UnitOption[]);
      } catch {
        // Options load failure is non-critical; form will show empty selects
      } finally {
        setOptionsLoading(false);
      }
    };
    fetchOptions();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      setFilteredUnits(allUnits.filter((u) => u.property_id === selectedProperty));
    } else {
      setFilteredUnits([]);
    }
  }, [selectedProperty, allUnits]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new FormData(e.currentTarget);
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Authentication error. Please refresh and try again.");
        setLoading(false);
        return;
      }

      const propertyId = formData.get("property_id") as string;
      if (!propertyId) {
        setError(t("property") + " is required.");
        setLoading(false);
        return;
      }

      const payload: Record<string, unknown> = {
        property_id: propertyId,
        category: formData.get("category") as string,
        description: formData.get("description") as string,
        amount: parseFloat(formData.get("amount") as string),
        expense_date: formData.get("expense_date") as string,
        created_by: user.id,
      };

      const unitId = formData.get("unit_id") as string;
      if (unitId) payload.unit_id = unitId;

      const vendor = formData.get("vendor") as string;
      if (vendor) payload.vendor = vendor;

      const { data: expense, error: insertError } = await supabase
        .from("expenses")
        .insert(payload)
        .select("id")
        .single();

      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }

      // Upload receipt if provided
      if (receiptFile && expense?.id) {
        const ext = receiptFile.name.split(".").pop() || "pdf";
        const filePath = `receipts/${expense.id}/${Date.now()}.${ext}`;
        await supabase.storage
          .from("expense-receipts")
          .upload(filePath, receiptFile);
        // Store receipt URL on expense (best-effort, don't block on failure)
        await supabase
          .from("expenses")
          .update({ receipt_url: filePath })
          .eq("id", expense.id);
      }

      logAudit(supabase, {
        action: "create",
        entity_type: "expense",
        entity_id: expense?.id,
        metadata: {
          amount: payload.amount,
          category: payload.category,
        },
      });

      router.push(`/${locale}/expenses`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setLoading(false);
    }
  };

  const inputClass =
    "w-full h-10 bg-surface-elevated/50 border border-border/60 rounded-lg px-3 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-surface-elevated transition-all duration-200";

  const labelClass =
    "block text-sm font-medium text-text-secondary mb-1.5 tracking-tight";

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-2xl animate-fade-in-up">
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {tc("back")}
        </button>
        <h1 className="text-2xl font-display font-bold text-text-primary tracking-tight">
          {t("addExpense")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">{t("subtitle")}</p>
      </div>

      {optionsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 text-accent animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-surface border border-border/40 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  {t("property")} <span className="text-destructive">*</span>
                </label>
                <select
                  name="property_id"
                  required
                  className={inputClass}
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                >
                  <option value="">Select property...</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  {t("unit")} ({tc("optional")})
                </label>
                <select name="unit_id" className={inputClass}>
                  <option value="">Select unit...</option>
                  {filteredUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_number}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  {t("category")} <span className="text-destructive">*</span>
                </label>
                <select name="category" required className={inputClass}>
                  <option value="maintenance">{t("categories.maintenance")}</option>
                  <option value="insurance">{t("categories.insurance")}</option>
                  <option value="utilities">{t("categories.utilities")}</option>
                  <option value="cleaning">{t("categories.cleaning")}</option>
                  <option value="legal">{t("categories.legal")}</option>
                  <option value="taxes">{t("categories.taxes")}</option>
                  <option value="management_fees">{t("categories.management_fees")}</option>
                  <option value="other">{t("categories.other")}</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  {t("date")} <span className="text-destructive">*</span>
                </label>
                <input
                  name="expense_date"
                  type="date"
                  required
                  defaultValue={today}
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                {t("description")}
              </label>
              <textarea
                name="description"
                rows={3}
                className="w-full bg-surface-elevated/50 border border-border/60 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-surface-elevated transition-all duration-200 resize-none"
                placeholder={t("description") + "..."}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  {t("amount")} (OMR) <span className="text-destructive">*</span>
                </label>
                <input
                  name="amount"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  className={`${inputClass} font-mono`}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className={labelClass}>
                  {t("vendor")}
                </label>
                <input
                  name="vendor"
                  className={inputClass}
                  placeholder={t("vendor") + "..."}
                />
              </div>
            </div>
          </div>

          {/* Receipt Upload */}
          <div className="bg-surface border border-border/40 rounded-xl p-6">
            <label className={labelClass}>
              Receipt / Invoice ({tc("optional")})
            </label>
            <div className="mt-1.5">
              {receiptFile ? (
                <div className="flex items-center gap-3 p-3 bg-success/5 border border-success/20 rounded-lg">
                  <Upload className="h-4 w-4 text-success" />
                  <span className="text-sm text-text-primary truncate flex-1">{receiptFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setReceiptFile(null)}
                    className="text-xs text-text-secondary hover:text-destructive transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-border/60 rounded-lg cursor-pointer hover:border-accent/40 transition-colors">
                  <Upload className="h-6 w-6 text-text-secondary/40 mb-2" />
                  <span className="text-sm text-text-secondary">Upload receipt (PDF, image)</span>
                  <span className="text-xs text-text-secondary/60 mt-0.5">Max 10MB</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && file.size <= 10 * 1024 * 1024) {
                        setReceiptFile(file);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" loading={loading}>
              {tc("submit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {tc("cancel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
