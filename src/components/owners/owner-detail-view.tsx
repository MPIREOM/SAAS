"use client";

import { useState } from "react";
import { Pencil, Wallet, Building2, Banknote, Receipt, Activity } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { PageHeader } from "@/components/ui/page-header";
import { EditOwnerDialog } from "@/components/owners/edit-owner-dialog";
import { OwnerActivityPanel } from "@/components/owners/owner-activity-panel";
import { OwnerPropertiesPanel } from "@/components/owners/owner-properties-panel";
import { OwnerSettlementsPanel } from "@/components/owners/owner-settlements-panel";
import { OwnerBusinessFeesPanel } from "@/components/owners/owner-business-fees-panel";
import type { OwnerDetailProps } from "@/components/owners/types";

type TabKey = "activity" | "properties" | "settlements" | "fees";

const TABS: { key: TabKey; label: string; icon: typeof Activity }[] = [
  { key: "activity", label: "Activity", icon: Activity },
  { key: "properties", label: "Properties", icon: Building2 },
  { key: "settlements", label: "Settlements", icon: Banknote },
  { key: "fees", label: "Business Fees", icon: Receipt },
];

export function OwnerDetailView(props: OwnerDetailProps) {
  const { owner, balance } = props;
  const [tab, setTab] = useState<TabKey>("activity");
  const [editOwnerOpen, setEditOwnerOpen] = useState(false);

  // Friendly headline strings derived from the live balance calc.
  const balanceNumber = balance?.balance ?? Number(owner.opening_balance || 0);
  const sideLabel = balanceNumber > 0.005
    ? `Company owes ${owner.name}`
    : balanceNumber < -0.005
      ? `${owner.name} owes the company`
      : "Settled";
  const sideTone = balanceNumber > 0.005
    ? "text-emerald-400"
    : balanceNumber < -0.005
      ? "text-amber-400"
      : "text-text-secondary";

  return (
    <div className="space-y-6">
      <PageHeader title={owner.name} description="Owner ledger">
        <button
          onClick={() => setEditOwnerOpen(true)}
          className="inline-flex items-center gap-2 h-10 px-4 bg-surface-elevated/80 border border-border/60 hover:border-accent/40 text-sm font-medium rounded-xl transition-colors"
        >
          <Pencil className="h-4 w-4" />
          Edit owner
        </button>
      </PageHeader>

      {/* Headline balance card */}
      <div className="rounded-2xl border border-border/60 bg-surface-elevated/40 p-6">
        <div className="flex items-center gap-3 text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
          <Wallet className="h-4 w-4" /> Current balance
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className={`text-4xl font-bold font-mono tabular-nums ${sideTone}`}>
            {balanceNumber > 0 ? "+" : ""}
            {balanceNumber.toLocaleString("en-OM", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-base text-text-secondary font-medium">
            {CURRENCY.code}
          </span>
        </div>
        <div className={`text-sm mt-2 ${sideTone}`}>{sideLabel}</div>
        <div className="text-xs text-text-secondary mt-1">
          As of {balance?.asOf ?? new Date().toISOString().split("T")[0]}
        </div>
      </div>

      {/* Breakdown card */}
      {balance && <BalanceBreakdownCard breakdown={balance.breakdown} />}

      {/* Owner profile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ProfileTile
          label="WhatsApp"
          value={owner.whatsapp_phone ? `+${owner.whatsapp_phone}` : "—"}
        />
        <ProfileTile label="Language" value={owner.language_preference.toUpperCase()} />
        <ProfileTile
          label="Opening balance"
          value={`${Number(owner.opening_balance).toLocaleString("en-OM", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${CURRENCY.code}`}
        />
        <ProfileTile
          label="Opening date"
          value={formatDate(owner.opening_balance_date)}
        />
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap gap-2 border-b border-border/60 -mb-px overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {tab === "activity" && <OwnerActivityPanel {...props} />}
        {tab === "properties" && <OwnerPropertiesPanel {...props} />}
        {tab === "settlements" && <OwnerSettlementsPanel {...props} />}
        {tab === "fees" && <OwnerBusinessFeesPanel {...props} />}
      </div>

      <EditOwnerDialog
        open={editOwnerOpen}
        onOpenChange={setEditOwnerOpen}
        owner={owner}
      />
    </div>
  );
}

function BalanceBreakdownCard({
  breakdown,
}: {
  breakdown: NonNullable<OwnerDetailProps["balance"]>["breakdown"];
}) {
  const rows: { label: string; value: number; sign: "+" | "-" | ""; muted?: boolean }[] = [
    { label: "Opening balance", value: breakdown.openingBalance, sign: "" },
    { label: "Rent collected (cash + transfer)", value: breakdown.rentReceivedToCompany, sign: "+" },
    {
      label: "Rent paid by cheque (direct to owner)",
      value: breakdown.rentReceivedDirectByCheque,
      sign: "",
      muted: true,
    },
    { label: "Commission earned by company", value: breakdown.commissionEarned, sign: "-" },
    {
      label: "Commission catch-up (early move-outs)",
      value: breakdown.earlyTerminationCommissionCatchUp,
      sign: "-",
    },
    { label: "Business manager fees", value: breakdown.businessManagerFees, sign: "-" },
    { label: "Expenses paid by company", value: breakdown.expensesCoveredByCompany, sign: "-" },
    { label: "Settlements paid to owner", value: breakdown.settlementsPaidToOwner, sign: "-" },
    { label: "Settlements received from owner", value: breakdown.settlementsReceivedFromOwner, sign: "+" },
  ];
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-elevated/30 p-6">
      <div className="text-xs uppercase tracking-wider text-text-secondary font-medium mb-4">
        Breakdown
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`flex items-center justify-between py-2.5 text-sm ${r.muted ? "opacity-60" : ""}`}
          >
            <span className="text-text-secondary">
              {r.sign && <span className="font-mono mr-1">{r.sign}</span>}
              {r.label}
              {r.muted && (
                <span className="ms-2 text-[10px] uppercase tracking-wider text-text-secondary">
                  Reference only
                </span>
              )}
            </span>
            <span className="font-mono tabular-nums text-text-primary">
              {r.value.toLocaleString("en-OM", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-4 mt-2 text-base font-semibold">
          <span>= Current balance</span>
          <span className="font-mono tabular-nums text-accent">
            {breakdown.balance.toLocaleString("en-OM", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {CURRENCY.code}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProfileTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-4">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary font-medium mb-1.5">
        {label}
      </div>
      <div className="text-sm font-medium text-text-primary truncate">{value}</div>
    </div>
  );
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
