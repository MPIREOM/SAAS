import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import {
  Receipt,
  Plus,
  Building2,
  Pencil,
} from "lucide-react";
import { CURRENCY } from "@/lib/currency";

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { property, page } = await searchParams;
  const t = await getTranslations("expenses");
  const supabase = await createClient();

  // Property-level access control
  const propertyIds = await getUserAccessiblePropertyIds(supabase);

  // Build query
  let query = supabase
    .from("expenses")
    .select(`
      *,
      properties:property_id(name),
      units:unit_id(unit_number)
    `)
    .order("expense_date", { ascending: false });

  if (property) {
    query = query.eq("property_id", property);
  }

  if (propertyIds !== null) {
    query = query.in("property_id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
  }

  // Pagination
  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, parseInt(page || "1", 10));

  // Get total count
  let countQuery = supabase
    .from("expenses")
    .select("*", { count: "exact", head: true });

  if (property) {
    countQuery = countQuery.eq("property_id", property);
  }

  if (propertyIds !== null) {
    countQuery = countQuery.in("property_id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
  }

  const { count: totalCount } = await countQuery;
  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

  const { data: expenses } = await query
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

  // Get properties for filter
  let propertiesQuery = supabase
    .from("properties")
    .select("id, name")
    .order("name");
  if (propertyIds !== null) {
    propertiesQuery = propertiesQuery.in("id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
  }
  const { data: properties } = await propertiesQuery;

  const allExpenses = expenses || [];
  const totalAmount = allExpenses.reduce(
    (sum, exp) => sum + Number(exp.amount || 0),
    0
  );

  function formatAmount(amount: number) {
    return amount.toLocaleString("en-OM", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary font-display tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${locale}/expenses/new`}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-accent text-background text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("addExpense")}
        </Link>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-text-secondary" />
          <Link
            href={`/${locale}/expenses`}
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
              !property
                ? "bg-accent/10 text-accent font-medium"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
            }`}
          >
            {t("allProperties")}
          </Link>
          {(properties || []).map((p: Record<string, unknown>) => (
            <Link
              key={p.id as string}
              href={`/${locale}/expenses?property=${p.id as string}`}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                property === (p.id as string)
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
              }`}
            >
              {p.name as string}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      {allExpenses.length > 0 ? (
        <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("date")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("property")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("category")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("description")}
                  </th>
                  <th className="text-end text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("amount")}
                  </th>
                  <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-5 py-3">
                    {t("vendor")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {allExpenses.map(
                  (expense: Record<string, unknown>, index: number) => {
                    const prop = expense.properties as Record<
                      string,
                      unknown
                    > | null;
                    const unit = expense.units as Record<
                      string,
                      unknown
                    > | null;

                    return (
                      <tr
                        key={expense.id as string}
                        className="group border-b border-border/20 last:border-0 hover:bg-surface-elevated/40 transition-colors duration-150"
                        style={{
                          animationDelay: `${index * 20}ms`,
                        }}
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/${locale}/expenses/${expense.id}/edit`}
                            className="text-sm text-text-primary font-mono tabular-nums hover:text-accent transition-colors inline-flex items-center gap-1.5"
                          >
                            {formatDate(expense.expense_date as string)}
                            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-text-primary">
                              {(prop?.name as string) || "—"}
                            </span>
                            {unit?.unit_number ? (
                              <>
                                <span className="text-border">/</span>
                                <span className="text-sm font-mono text-text-secondary">
                                  {unit.unit_number as string}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center text-[11px] px-2.5 py-1 rounded-md font-semibold bg-surface-elevated text-text-secondary border border-border/30">
                            {t(`categories.${expense.category as string}`)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-text-secondary line-clamp-1">
                            {(expense.description as string) || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-end">
                          <span className="text-sm font-semibold font-mono tabular-nums text-text-primary">
                            {formatAmount(expense.amount as number)}
                            <span className="text-[10px] font-normal text-text-secondary ml-0.5">
                              {CURRENCY.code}
                            </span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-text-secondary">
                            {(expense.vendor as string) || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              {allExpenses.length} {t("title").toLowerCase()}
            </span>
            <span className="text-xs font-mono font-medium text-text-secondary tabular-nums">
              {t("totalExpenses")}: {formatAmount(totalAmount)} {CURRENCY.code}
            </span>
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl={`/${locale}/expenses`}
            searchParams={{
              ...(property ? { property } : {}),
            }}
          />
        </div>
      ) : (
        <div className="bg-surface border border-border/60 rounded-xl p-16 text-center">
          <div className="mx-auto w-14 h-14 rounded-xl bg-surface-elevated flex items-center justify-center mb-4">
            <Receipt className="h-7 w-7 text-text-secondary/40" />
          </div>
          <h3 className="text-base font-semibold text-text-primary font-display mb-1">
            {t("noExpenses")}
          </h3>
          <p className="text-sm text-text-secondary max-w-xs mx-auto">
            {t("noExpensesDescription")}
          </p>
          <Link
            href={`/${locale}/expenses/new`}
            className="inline-flex items-center gap-2 mt-4 h-10 px-4 rounded-lg bg-accent text-background text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("addExpense")}
          </Link>
        </div>
      )}
    </div>
  );
}
