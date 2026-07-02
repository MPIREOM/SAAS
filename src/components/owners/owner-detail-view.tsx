"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Wallet, Building2, Banknote, Receipt, Activity, FileText } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { EditOwnerDialog } from "@/components/owners/edit-owner-dialog";
import { OwnerActivityPanel } from "@/components/owners/owner-activity-panel";
import { OwnerPropertiesPanel } from "@/components/owners/owner-properties-panel";
import { OwnerSettlementsPanel } from "@/components/owners/owner-settlements-panel";
import { OwnerBusinessFeesPanel } from "@/components/owners/owner-business-fees-panel";
import type { OwnerDetailProps } from "@/components/owners/types";

type TabKey = "activity" | "properties" | "settlements" | "fees";

const TABS: { key: TabKey; icon: typeof Activity }[] = [
  { key: "activity", icon: Activity },
  { key: "properties", icon: Building2 },
  { key: "settlements", icon: Banknote },
  { key: "fees", icon: Receipt },
];

export function OwnerDetailView(props: OwnerDetailProps) {
  const { owner, balance } = props;
  const t = useTranslations("owners");
  const [tab, setTab] = useState<TabKey>("activity");
  const [editOwnerOpen, setEditOwnerOpen] = useState(false);

  // Friendly headline strings derived from the live balance calc.
  const balanceNumber = balance?.balance ?? Number(owner.opening_balance || 0);
  const sideLabel = balanceNumber > 0.005
    ? t("companyOwesOwner", { name: owner.name })
    : balanceNumber < -0.005
      ? t("ownerOwesCompany", { name: owner.name })
      : t("settled");
  const sideTone = balanceNumber > 0.005
    ? "text-success"
    : balanceNumber < -0.005
      ? "text-destructive"
      : "text-text-secondary";

  return (
    <div className="space-y-6">
      <PageHeader title={owner.name} description={t("title")}>
        <a
          href={`/api/owners/${owner.id}/monthly-report/pdf`}
          target="_blank"
          rel="noopener"
          className={cn(buttonVariants({ variant: "secondary" }))}
        >
          <FileText aria-hidden="true" className="h-4 w-4" />
          {t("previewReport")}
        </a>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditOwnerOpen(true)}
        >
          <Pencil aria-hidden="true" className="h-4 w-4" />
          {t("editOwner")}
        </Button>
      </PageHeader>

      {/* Headline balance card */}
      <section
        aria-label={t("currentBalance")}
        className="animate-fade-in-up rounded-xl border border-border/60 bg-surface-elevated/40 p-6"
      >
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          <Wallet aria-hidden="true" className="h-4 w-4 text-accent" />
          {t("currentBalance")}
        </div>
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className={cn(
              "font-mono text-4xl font-bold tabular-nums ltr-nums",
              sideTone,
            )}
          >
            {balanceNumber > 0 ? "+" : ""}
            {balanceNumber.toLocaleString("en-OM", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-base font-medium text-text-secondary">
            {CURRENCY.code}
          </span>
        </div>
        <div className={cn("mt-2 text-sm font-medium", sideTone)}>{sideLabel}</div>
        <div className="mt-1 text-xs text-text-secondary">
          As of{" "}
          <span className="font-mono ltr-nums">
            {balance?.asOf ?? new Date().toISOString().split("T")[0]}
          </span>
        </div>
      </section>

      {/* Breakdown card */}
      {balance && <BalanceBreakdownCard breakdown={balance.breakdown} />}

      {/* Owner profile grid */}
      <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProfileTile
          label="WhatsApp"
          value={owner.whatsapp_phone ? `+${owner.whatsapp_phone}` : "—"}
          mono
        />
        <ProfileTile label="Language" value={owner.language_preference.toUpperCase()} />
        <ProfileTile
          label="Opening balance"
          value={`${Number(owner.opening_balance).toLocaleString("en-OM", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${CURRENCY.code}`}
          mono
        />
        <ProfileTile
          label="Opening date"
          value={formatDate(owner.opening_balance_date)}
          mono
        />
      </div>

      {/* Tab nav */}
      <div
        role="tablist"
        aria-label="Owner ledger sections"
        className="-mb-px flex flex-wrap gap-2 overflow-x-auto border-b border-border/60"
      >
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          const isActive = tab === tabItem.key;
          return (
            <button
              key={tabItem.key}
              type="button"
              role="tab"
              id={`owner-tab-${tabItem.key}`}
              aria-selected={isActive}
              aria-controls={`owner-panel-${tabItem.key}`}
              onClick={() => setTab(tabItem.key)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset",
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {t(`tabs.${tabItem.key}`)}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div
        role="tabpanel"
        id={`owner-panel-${tab}`}
        aria-labelledby={`owner-tab-${tab}`}
      >
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
  const t = useTranslations("owners");
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
    <section
      aria-label="Balance breakdown"
      className="animate-fade-in-up rounded-xl border border-border/60 bg-surface-elevated/30 p-6"
    >
      <h2 className="mb-4 font-display text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {t("breakdown")}
      </h2>
      <dl className="divide-y divide-border/30">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn(
              "flex items-center justify-between gap-4 py-2.5 text-sm",
              r.muted && "opacity-60",
            )}
          >
            <dt className="min-w-0 text-text-secondary">
              {r.label}
              {r.muted && (
                <span className="ms-2 text-[10px] uppercase tracking-wider text-text-secondary">
                  Reference only
                </span>
              )}
            </dt>
            <dd
              className={cn(
                "shrink-0 font-mono tabular-nums ltr-nums text-end",
                r.sign === "+" && "text-success",
                r.sign === "-" && "text-destructive",
                r.sign === "" && "text-text-primary",
              )}
            >
              {r.sign && <span className="me-1">{r.sign}</span>}
              {r.value.toLocaleString("en-OM", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </dd>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between gap-4 pt-4 text-base font-semibold">
          <dt className="font-display tracking-tight text-text-primary">
            = {t("currentBalance")}
          </dt>
          <dd className="shrink-0 font-mono tabular-nums ltr-nums text-end text-accent">
            {breakdown.balance.toLocaleString("en-OM", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {CURRENCY.code}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ProfileTile({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-4 transition-colors hover:border-border">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div
        className={cn(
          "truncate text-sm font-medium text-text-primary",
          mono && "font-mono ltr-nums",
        )}
      >
        {value}
      </div>
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
