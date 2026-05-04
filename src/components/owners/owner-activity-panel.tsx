"use client";

import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Receipt, Banknote, FileText } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
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
  const [windowDays, setWindowDays] = useState(activityWindowDays);

  const items = useMemo(() => buildActivity({
    payments, expenses, settlements, businessFees, leaseInfo,
  }), [payments, expenses, settlements, businessFees, leaseInfo]);

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - windowDays);
    return d.toISOString().split("T")[0];
  }, [windowDays]);

  const visible = items.filter((i) => i.date >= cutoff);

  return (
    <div className="space-y-4">
      {/* Window selector */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-secondary">Window:</span>
        {[7, 30, 90, 365].map((d) => (
          <button
            key={d}
            onClick={() => setWindowDays(d)}
            className={`px-3 py-1.5 rounded-lg border transition-colors ${
              windowDays === d
                ? "bg-accent/10 border-accent/40 text-accent"
                : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border"
            }`}
          >
            {d === 365 ? "1y" : `${d}d`}
          </button>
        ))}
        <span className="ms-auto text-text-secondary">
          {visible.length} {visible.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No activity in this window"
          description="Try a longer window above, or log an expense / payment via WhatsApp."
        />
      ) : (
        <div className="rounded-2xl border border-border/60 bg-surface-elevated/30 divide-y divide-border/40 overflow-hidden">
          {visible.map((item, i) => (
            <ActivityRow key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = ICONS[item.kind];
  const tone = item.sign === "+"
    ? "text-emerald-400"
    : item.sign === "-"
      ? "text-amber-400"
      : "text-text-secondary";
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`mt-0.5 ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-primary truncate">
            {item.primary}
          </span>
          {item.badge && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-elevated border border-border/40 text-text-secondary">
              {item.badge}
            </span>
          )}
        </div>
        <div className="text-xs text-text-secondary mt-0.5 truncate">
          {item.secondary}
        </div>
      </div>
      <div className="text-end shrink-0">
        <div className={`text-sm font-mono tabular-nums font-semibold ${tone}`}>
          {item.sign === "+" && "+"}
          {item.sign === "-" && "−"}
          {item.amount.toLocaleString("en-OM", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          <span className="text-[10px] text-text-secondary font-sans">
            {CURRENCY.code}
          </span>
        </div>
        <div className="text-[10px] text-text-secondary mt-0.5">
          {formatDate(item.date)}
        </div>
      </div>
    </div>
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
}: Pick<
  OwnerDetailProps,
  "payments" | "expenses" | "settlements" | "businessFees" | "leaseInfo"
>): ActivityItem[] {
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
      primary: info ? `Rent — ${info.tenantName}` : "Rent payment",
      secondary: info
        ? `${info.propertyName} · Unit ${info.unitNumber} · ${labelMethod(p.method)}`
        : labelMethod(p.method),
      badge: direct ? "direct to owner" : undefined,
    });
  }

  for (const e of expenses) {
    const propName = pickJoinedName(e.properties);
    out.push({
      date: e.expense_date,
      kind: "expense",
      sign: "-",
      amount: Number(e.amount || 0),
      primary: e.description || labelCategory(e.category),
      secondary: [
        labelCategory(e.category),
        propName ? `Property: ${propName}` : "Owner-level",
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
          ? "Paid to owner"
          : "Received from owner",
      secondary: [
        labelMethod(s.method),
        s.reference_number ? `Ref ${s.reference_number}` : null,
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
      primary: "Business manager fee",
      secondary: f.notes || `Period ${f.period_month.slice(0, 7)}`,
    });
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function labelMethod(method: string): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "bank_transfer":
      return "Bank transfer";
    case "cheque":
      return "Cheque";
    default:
      return method;
  }
}

function labelCategory(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase());
}

function pickJoinedName(joined: unknown): string | null {
  if (!joined) return null;
  const v = Array.isArray(joined) ? joined[0] : joined;
  return (v as { name?: string })?.name || null;
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}
