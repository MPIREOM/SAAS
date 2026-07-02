"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { FileText, Upload, X } from "lucide-react";

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
  const { locale } = use(params);
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

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
        // Options load failure is non-critical; form will show empty selects.
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
        setError(t("authError"));
        setLoading(false);
        return;
      }

      const propertyId = formData.get("property_id") as string;
      if (!propertyId) {
        setError(t("propertyRequired"));
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

      // Upload receipt if provided. Failure is silent — the expense itself
      // is already created and useful without the attached receipt.
      if (receiptFile && expense?.id) {
        const ext = receiptFile.name.split(".").pop() || "pdf";
        const filePath = `receipts/${expense.id}/${Date.now()}.${ext}`;
        await supabase.storage
          .from("expense-receipts")
          .upload(filePath, receiptFile);
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
      setError(err instanceof Error ? err.message : t("unexpectedError"));
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={t("addExpense")}
        description={t("subtitle")}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/expenses` },
          { label: t("addExpense") },
        ]}
      />

      {optionsLoading ? (
        <div className="flex items-center justify-center py-20" aria-busy="true">
          <Spinner sizeClassName="h-5 w-5" label={tc("loading")} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-surface border border-border/40 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                name="property_id"
                required
                label={`${t("property")} *`}
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                placeholder={t("selectProperty")}
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>

              <Select
                name="unit_id"
                label={`${t("unit")} (${tc("optional")})`}
                placeholder={t("selectUnit")}
                defaultValue=""
              >
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_number}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                name="category"
                required
                defaultValue="maintenance"
                label={`${t("category")} *`}
              >
                <option value="maintenance">{t("categories.maintenance")}</option>
                <option value="insurance">{t("categories.insurance")}</option>
                <option value="utilities">{t("categories.utilities")}</option>
                <option value="cleaning">{t("categories.cleaning")}</option>
                <option value="legal">{t("categories.legal")}</option>
                <option value="taxes">{t("categories.taxes")}</option>
                <option value="management_fees">{t("categories.management_fees")}</option>
                <option value="other">{t("categories.other")}</option>
              </Select>

              <Input
                name="expense_date"
                type="date"
                required
                defaultValue={today}
                label={`${t("date")} *`}
                className="font-mono ltr-nums"
              />
            </div>

            <Textarea
              name="description"
              rows={3}
              label={t("description")}
              placeholder={`${t("description")}…`}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="amount"
                type="number"
                required
                min={0}
                step={0.01}
                label={`${t("amount")} (OMR) *`}
                placeholder="0.00"
                className="font-mono ltr-nums tabular-nums"
              />
              <Input
                name="vendor"
                label={t("vendor")}
                placeholder={`${t("vendor")}…`}
              />
            </div>
          </div>

          {/* Receipt Upload */}
          <div className="bg-surface border border-border/40 rounded-xl p-6">
            <span className="block text-sm font-medium text-foreground tracking-tight mb-2">
              {t("receiptLabel")} ({tc("optional")})
            </span>
            {receiptFile ? (
              <div className="flex items-center gap-3 p-3 bg-success/5 border border-success/20 rounded-lg">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
                  <FileText aria-hidden="true" className="h-4 w-4 text-success" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary truncate">{receiptFile.name}</p>
                  <p className="text-xs text-text-secondary font-mono ltr-nums">
                    {(receiptFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReceiptFile(null)}
                  className="inline-flex items-center gap-1 text-xs text-text-secondary cursor-pointer hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 rounded px-1.5 py-1"
                >
                  <X aria-hidden="true" className="h-3 w-3" />
                  {t("receiptRemove")}
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center py-7 border-2 border-dashed border-border/60 rounded-xl cursor-pointer transition-all duration-200 hover:border-accent/40 hover:bg-accent/5 focus-within:ring-2 focus-within:ring-accent/40">
                <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated">
                  <Upload aria-hidden="true" className="h-5 w-5 text-text-secondary/60" />
                </span>
                <span className="text-sm text-text-secondary">{t("receiptUploadCta")}</span>
                <span className="text-xs text-text-secondary/60 mt-0.5">{t("receiptUploadHint")}</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  aria-label={t("receiptUploadCta")}
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

          {error && <Alert variant="destructive">{error}</Alert>}

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
