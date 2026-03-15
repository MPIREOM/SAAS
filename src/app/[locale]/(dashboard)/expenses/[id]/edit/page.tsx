"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";

interface PropertyOption {
  id: string;
  name: string;
}

interface UnitOption {
  id: string;
  unit_number: string;
  property_id: string;
}

interface Expense {
  id: string;
  property_id: string;
  unit_id: string | null;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  vendor: string | null;
}

export default function EditExpensePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("expenses");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [allUnits, setAllUnits] = useState<UnitOption[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<UnitOption[]>([]);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [locale, setLocale] = useState("en");
  const [expenseId, setExpenseId] = useState("");

  useEffect(() => {
    params.then((p) => {
      setLocale(p.locale);
      setExpenseId(p.id);
    });
  }, [params]);

  // Load form options and expense data
  useEffect(() => {
    if (!expenseId) return;

    const fetchData = async () => {
      try {
        const supabase = createClient();
        const [propsRes, unitsRes, expenseRes] = await Promise.all([
          supabase.from("properties").select("id, name").order("name"),
          supabase.from("units").select("id, unit_number, property_id").order("unit_number"),
          supabase.from("expenses").select("*").eq("id", expenseId).single(),
        ]);
        if (propsRes.data) setProperties(propsRes.data as PropertyOption[]);
        if (unitsRes.data) setAllUnits(unitsRes.data as UnitOption[]);
        if (expenseRes.data) {
          const exp = expenseRes.data as Expense;
          setExpense(exp);
          setSelectedProperty(exp.property_id);
        }
        if (expenseRes.error) {
          setError("Expense not found.");
        }
      } catch (err) {
        console.error("Failed to load expense:", err);
        setError("Failed to load expense data.");
      } finally {
        setOptionsLoading(false);
      }
    };
    fetchData();
  }, [expenseId]);

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
      };

      const unitId = formData.get("unit_id") as string;
      payload.unit_id = unitId || null;

      const vendor = formData.get("vendor") as string;
      payload.vendor = vendor || null;

      const { error: updateError } = await supabase
        .from("expenses")
        .update(payload)
        .eq("id", expenseId);

      if (updateError) {
        console.error("Expense update error:", updateError);
        setError(updateError.message);
        setLoading(false);
        return;
      }

      await logAudit(supabase, {
        action: "update",
        entity_type: "expense",
        entity_id: expenseId,
      });

      router.push(`/${locale}/expenses`);
      router.refresh();
    } catch (err) {
      console.error("Unexpected error updating expense:", err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirmDeleteExpense"))) return;

    setDeleting(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseId);

      if (deleteError) {
        console.error("Expense delete error:", deleteError);
        setError(deleteError.message);
        setDeleting(false);
        return;
      }

      await logAudit(supabase, {
        action: "delete",
        entity_type: "expense",
        entity_id: expenseId,
      });

      router.push(`/${locale}/expenses`);
      router.refresh();
    } catch (err) {
      console.error("Unexpected error deleting expense:", err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setDeleting(false);
    }
  };

  const inputClass =
    "w-full h-10 bg-surface-elevated/50 border border-border/60 rounded-lg px-3 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-surface-elevated transition-all duration-200";

  const labelClass =
    "block text-sm font-medium text-text-secondary mb-1.5 tracking-tight";

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
          {t("editExpense")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">{t("subtitle")}</p>
      </div>

      {optionsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 text-accent animate-spin" />
        </div>
      ) : !expense ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-text-secondary">{error || "Expense not found."}</p>
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
                <select
                  name="unit_id"
                  className={inputClass}
                  defaultValue={expense.unit_id || ""}
                >
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
                <select
                  name="category"
                  required
                  className={inputClass}
                  defaultValue={expense.category}
                >
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
                  defaultValue={expense.expense_date}
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
                defaultValue={expense.description || ""}
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
                  defaultValue={expense.amount}
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
                  defaultValue={expense.vendor || ""}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
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
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              loading={deleting}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {t("deleteExpense")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
