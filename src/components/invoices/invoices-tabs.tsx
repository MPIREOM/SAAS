"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Select } from "@/components/ui/select";

interface InvoicesTabsProps {
  invoices: Record<string, unknown>[];
  availableMonths: string[];
  currentStatus: string;
  currentMonth: string;
  currentProperty?: string;
  locale: string;
}

export function InvoicesTabs({
  invoices,
  availableMonths,
  currentStatus,
  currentMonth,
  currentProperty,
  locale,
}: InvoicesTabsProps) {
  const t = useTranslations("invoices");
  const router = useRouter();

  // Compute counts for badge display
  const allCount = invoices.length;
  const pendingCount = invoices.filter(
    (inv) =>
      (inv.status as string) === "pending" ||
      (inv.status as string) === "overdue" ||
      (inv.status as string) === "partial"
  ).length;
  const paidCount = invoices.filter(
    (inv) => (inv.status as string) === "paid"
  ).length;
  const resolvedCount = invoices.filter(
    (inv) =>
      (inv.status as string) === "written_off" ||
      (inv.status as string) === "cancelled"
  ).length;

  const tabs = [
    { key: "all", label: t("all"), count: allCount },
    { key: "pending", label: t("pending"), count: pendingCount },
    { key: "paid", label: t("paid"), count: paidCount },
    { key: "resolved", label: t("resolved"), count: resolvedCount },
  ];

  function buildUrl(status: string, month: string) {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (month) params.set("month", month);
    if (currentProperty) params.set("property", currentProperty);
    const qs = params.toString();
    return `/${locale}/invoices${qs ? `?${qs}` : ""}`;
  }

  function handleTabChange(tab: string) {
    router.push(buildUrl(tab, currentMonth));
  }

  function handleMonthChange(month: string) {
    router.push(buildUrl(currentStatus, month));
  }

  function formatMonth(monthStr: string) {
    const [year, mon] = monthStr.split("-").map(Number);
    const date = new Date(year, mon - 1);
    return date.toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      {/* Status Tabs */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible">
        <div
          role="group"
          aria-label={t("status")}
          className="inline-flex items-center gap-0.5 bg-surface border border-border/60 rounded-xl p-1"
        >
          {tabs.map((tab) => {
            const isActive = currentStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  isActive
                    ? "bg-accent text-accent-foreground shadow-sm shadow-accent/20"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                }`}
              >
                {tab.label}
                <span
                  className={`text-[10px] font-semibold font-mono tabular-nums ltr-nums px-1.5 py-0.5 rounded-md ${
                    isActive
                      ? "bg-accent-foreground/15 text-accent-foreground"
                      : "bg-surface-elevated text-text-secondary"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Month Filter */}
      <div className="relative self-start sm:self-auto">
        <CalendarDays
          className="pointer-events-none absolute start-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary"
          aria-hidden="true"
        />
        <Select
          value={currentMonth}
          onChange={(e) => handleMonthChange(e.target.value)}
          aria-label={t("filterByMonth")}
          className="ps-9 cursor-pointer"
        >
          <option value="">{t("allMonths")}</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
