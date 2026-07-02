"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/ui/page-header";
import { Trash2 } from "lucide-react";

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
          setError(t("expenseNotFound"));
        }
      } catch {
        setError(t("loadFailed"));
      } finally {
        setOptionsLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is stable per locale; only refetch when the expense id changes
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
      setError(err instanceof Error ? err.message : t("unexpectedError"));
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
      setError(err instanceof Error ? err.message : t("unexpectedError"));
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={t("editExpense")}
        description={t("subtitle")}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/expenses` },
          { label: t("editExpense") },
        ]}
      />

      {optionsLoading ? (
        <div className="flex items-center justify-center py-20" aria-busy="true">
          <Spinner sizeClassName="h-5 w-5" label={tc("loading")} />
        </div>
      ) : !expense ? (
        <Alert variant="destructive">{error || t("expenseNotFound")}</Alert>
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
              >
                <option value="">{t("selectProperty")}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>

              <Select
                name="unit_id"
                label={`${t("unit")} (${tc("optional")})`}
                defaultValue={expense.unit_id || ""}
              >
                <option value="">{t("selectUnit")}</option>
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
                label={`${t("category")} *`}
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
              </Select>

              <Input
                name="expense_date"
                type="date"
                required
                defaultValue={expense.expense_date}
                label={`${t("date")} *`}
                className="font-mono ltr-nums"
              />
            </div>

            <Textarea
              name="description"
              rows={3}
              label={t("description")}
              placeholder={`${t("description")}…`}
              defaultValue={expense.description || ""}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="amount"
                type="number"
                required
                min="0"
                step="0.01"
                label={`${t("amount")} (OMR) *`}
                placeholder="0.00"
                defaultValue={expense.amount}
                className="font-mono ltr-nums tabular-nums"
              />
              <Input
                name="vendor"
                label={t("vendor")}
                placeholder={`${t("vendor")}…`}
                defaultValue={expense.vendor || ""}
              />
            </div>
          </div>

          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/40"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {t("deleteExpense")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
