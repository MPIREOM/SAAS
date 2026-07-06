import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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

  // Get properties for filter
  let propertiesQuery = supabase
    .from("properties")
    .select("id, name")
    .order("name");
  if (propertyIds !== null) {
    propertiesQuery = propertiesQuery.in("id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
  }

  // Count, page and filter options load in parallel
  const [{ count: totalCount }, { data: expenses }, { data: properties }] =
    await Promise.all([
      countQuery,
      query.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
      propertiesQuery,
    ]);
  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

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
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Link
          href={`/${locale}/expenses/new`}
          className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("addExpense")}
        </Link>
      </PageHeader>

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
        <div className="bg-surface border border-border/60 rounded-xl overflow-hidden animate-fade-in">
          {/* Desktop table — hidden on mobile in favor of card list */}
          <div className="hidden overflow-x-auto md:block">
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
                          <Badge variant="secondary">
                            {t(`categories.${expense.category as string}`)}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-sm text-text-secondary line-clamp-1">
                            {(expense.description as string) || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-end">
                          <span className="text-sm font-semibold font-mono tabular-nums text-text-primary">
                            {formatAmount(expense.amount as number)}
                            <span className="text-[10px] font-normal text-text-secondary ms-0.5">
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

          {/* Mobile card list — same data, vertical layout for narrow screens */}
          <ul className="md:hidden divide-y divide-border/30">
            {allExpenses.map((expense: Record<string, unknown>) => {
              const prop = expense.properties as Record<string, unknown> | null;
              const unit = expense.units as Record<string, unknown> | null;
              return (
                <li key={`m-${expense.id as string}`} className="p-4">
                  <Link
                    href={`/${locale}/expenses/${expense.id}/edit`}
                    className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {(prop?.name as string) || "—"}
                          {unit?.unit_number ? ` · ${unit.unit_number as string}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
                          {(expense.description as string) || "—"}
                        </p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className="text-sm font-semibold font-mono tabular-nums text-text-primary">
                          {formatAmount(expense.amount as number)}{" "}
                          <span className="text-[10px] font-normal text-text-secondary">
                            {CURRENCY.code}
                          </span>
                        </p>
                        <p className="text-[11px] text-text-secondary font-mono tabular-nums mt-0.5">
                          {formatDate(expense.expense_date as string)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <Badge variant="secondary">
                        {t(`categories.${expense.category as string}`)}
                      </Badge>
                      {expense.vendor ? (
                        <span className="text-text-secondary truncate">
                          {expense.vendor as string}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

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
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title={t("noExpenses")}
          description={t("noExpensesDescription")}
          action={
            <Link
              href={`/${locale}/expenses/new`}
              className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t("addExpense")}
            </Link>
          }
        />
      )}
    </div>
  );
}
