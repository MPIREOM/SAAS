"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownCircle, ArrowUpCircle, Receipt, Banknote, FileText } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { OwnerDetailProps } from "@/components/owners/types";

type ActivityItem = {
  date: string;
  kind: "payment" | "expense" | "settlement" | "business_fee";
  // Sign convention used to colour the row: + means it moves the
  // balance toward "company owes owner", - means toward "owner owes
  // company". null = no balance impact (e.g. cheque-to-owner rent).
  sign: "+" | "-" | "0";
  amount: number;
  primary: string;
  secondary: string;
  badge?: string;
};

export function OwnerActivityPanel({
  payments,
  expenses,
  settlements,
  businessFees,
  leaseInfo,
  activityWindowDays,
}: OwnerDetailProps) {
  const t = useTranslations("owners");
  const tCommon = useTranslations("common");
  const tCategories = useTranslations("expenses.categories");
  const [windowDays, setWindowDays] = useState(activityWindowDays);

  const items = useMemo(() => buildActivity({
    payments, expenses, settlements, businessFees, leaseInfo, t, tCommon, tCategories,
  }), [payments, expenses, settlements, businessFees, leaseInfo, t, tCommon, tCategories]);

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - windowDays);
    return d.toISOString().split("T")[0];
  }, [windowDays]);

  const visible = items.filter((i) => i.date >= cutoff);

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Window selector */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-text-secondary">{t("activity.window")}:</span>
        {[7, 30, 90, 365].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setWindowDays(d)}
            aria-pressed={windowDays === d}
            className={cn(
              "cursor-pointer rounded-lg border px-3 py-1.5 font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              windowDays === d
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border/40 bg-surface-elevated/50 text-text-secondary hover:border-border hover:text-text-primary",
            )}
          >
            {d === 365 ? t("activity.windowYear") : t("activity.windowDays", { days: d })}
          </button>
        ))}
        <span className="ms-auto font-mono ltr-nums text-text-secondary">
          {t("activity.entryCount", { count: visible.length })}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title={t("noActivity")}
          description={t("activity.emptyDescription")}
        />
      ) : (
        <>
          {/* Desktop statement table */}
          <div className="hidden overflow-hidden rounded-xl border border-border/50 md:block">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-28">{tCommon("date")}</TableHead>
                  <TableHead>{t("activity.entry")}</TableHead>
                  <TableHead className="w-40 text-end">
                    {t("amountWithCode", { code: CURRENCY.code })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((item, i) => (
                  <ActivityTableRow key={i} item={item} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <ul className="space-y-2 md:hidden">
            {visible.map((item, i) => (
              <ActivityCard key={i} item={item} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function toneFor(sign: ActivityItem["sign"]): string {
  return sign === "+"
    ? "text-success"
    : sign === "-"
      ? "text-destructive"
      : "text-text-secondary";
}

function AmountCell({ item }: { item: ActivityItem }) {
  return (
    <span
      className={cn(
        "font-mono text-sm font-semibold tabular-nums ltr-nums",
        toneFor(item.sign),
      )}
    >
      {item.sign === "+" && "+"}
      {item.sign === "-" && "−"}
      {item.amount.toLocaleString("en-OM", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

function ActivityTableRow({ item }: { item: ActivityItem }) {
  const locale = useLocale();
  const Icon = ICONS[item.kind];
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-mono text-xs ltr-nums text-text-secondary">
        {formatDate(item.date, locale)}
      </TableCell>
      <TableCell>
        <div className="flex items-start gap-2.5">
          <Icon
            aria-hidden="true"
            className={cn("mt-0.5 h-4 w-4 shrink-0", toneFor(item.sign))}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-text-primary">
                {item.primary}
              </span>
              {item.badge && (
                <Badge variant="secondary" className="uppercase tracking-wider text-[10px]">
                  {item.badge}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-text-secondary">
              {item.secondary}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-end">
        <AmountCell item={item} />
      </TableCell>
    </TableRow>
  );
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const locale = useLocale();
  const Icon = ICONS[item.kind];
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/50 bg-surface-elevated/40 px-4 py-3">
      <div className={cn("mt-0.5", toneFor(item.sign))}>
        <Icon aria-hidden="true" className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">
            {item.primary}
          </span>
          {item.badge && (
            <Badge variant="secondary" className="uppercase tracking-wider text-[10px]">
              {item.badge}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-text-secondary">
          {item.secondary}
        </div>
      </div>
      <div className="shrink-0 text-end">
        <AmountCell item={item} />
        <span className="ms-1 text-[10px] text-text-secondary">
          {CURRENCY.code}
        </span>
        <div className="mt-0.5 font-mono text-[10px] ltr-nums text-text-secondary">
          {formatDate(item.date, locale)}
        </div>
      </div>
    </li>
  );
}

const ICONS = {
  payment: ArrowUpCircle,
  expense: ArrowDownCircle,
  settlement: Banknote,
  business_fee: FileText,
} as const;

function buildActivity({
  payments,
  expenses,
  settlements,
  businessFees,
  leaseInfo,
  t,
  tCommon,
  tCategories,
}: Pick<
  OwnerDetailProps,
  "payments" | "expenses" | "settlements" | "businessFees" | "leaseInfo"
> & {
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  tCategories: ReturnType<typeof useTranslations>;
}): ActivityItem[] {
  const out: ActivityItem[] = [];

  for (const p of payments) {
    const info = leaseInfo[p.lease_id];
    const direct = p.method === "cheque";
    out.push({
      date: p.payment_date,
      kind: "payment",
      // Cheque rent goes direct to owner — no balance impact for the
      // company holding ledger. Cash & transfer hit our account.
      sign: direct ? "0" : "+",
      amount: Number(p.amount || 0),
      primary: info
        ? t("activity.rentWithTenant", { name: info.tenantName })
        : t("activity.rentPayment"),
      secondary: info
        ? `${info.propertyName} · ${tCommon("unit")} ${info.unitNumber} · ${labelMethod(p.method, t)}`
        : labelMethod(p.method, t),
      badge: direct ? t("activity.directToOwner") : undefined,
    });
  }

  for (const e of expenses) {
    const propName = pickJoinedName(e.properties);
    out.push({
      date: e.expense_date,
      kind: "expense",
      sign: "-",
      amount: Number(e.amount || 0),
      primary: e.description || labelCategory(e.category, tCategories),
      secondary: [
        labelCategory(e.category, tCategories),
        propName
          ? t("activity.propertyPrefix", { name: propName })
          : t("activity.ownerLevel"),
        e.vendor || null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  for (const s of settlements) {
    out.push({
      date: s.settled_at,
      kind: "settlement",
      sign: s.direction === "company_to_owner" ? "-" : "+",
      amount: Number(s.amount || 0),
      primary:
        s.direction === "company_to_owner"
          ? t("paidToOwner")
          : t("receivedFromOwner"),
      secondary: [
        labelMethod(s.method, t),
        s.reference_number ? t("ref", { number: s.reference_number }) : null,
        s.notes,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  for (const f of businessFees) {
    out.push({
      date: f.period_month,
      kind: "business_fee",
      sign: "-",
      amount: Number(f.amount || 0),
      primary: t("activity.businessManagerFee"),
      secondary: f.notes || t("activity.period", { month: f.period_month.slice(0, 7) }),
    });
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function labelMethod(method: string, t: ReturnType<typeof useTranslations>): string {
  switch (method) {
    case "cash":
      return t("methods.cash");
    case "bank_transfer":
      return t("methods.bankTransfer");
    case "cheque":
      return t("methods.cheque");
    default:
      return method;
  }
}

function labelCategory(c: string, tCategories: ReturnType<typeof useTranslations>): string {
  if (tCategories.has(c)) return tCategories(c);
  return c.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase());
}

function pickJoinedName(joined: unknown): string | null {
  if (!joined) return null;
  const v = Array.isArray(joined) ? joined[0] : joined;
  return (v as { name?: string })?.name || null;
}

function formatDate(s: string, locale: string): string {
  try {
    return new Date(s).toLocaleDateString(`${locale}-u-nu-latn`, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}
