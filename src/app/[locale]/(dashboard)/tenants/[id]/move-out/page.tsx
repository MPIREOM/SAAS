"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LogOut, Plus, X, FileText, Download } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { Spinner } from "@/components/ui/spinner";
import { getEarlyTerminationCommissionForLease, type EarlyTerminationCommissionPreview } from "@/lib/owners/balance";

interface OutstandingInvoice {
  id: string;
  amount: string;
  paid_amount: string;
  due_date: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  lease_id: string;
  tenant_id: string;
  unit_id: string;
}

type InvoiceAction = "leave_open" | "write_off" | "cancel" | "settle";

type FeeKind = "cleaning" | "painting" | "early_termination" | "custom";

interface FeeRow {
  id: string;
  kind: FeeKind;
  description: string;
  amount: string; // string so empty inputs don't render NaN
}

interface LeaseContext {
  leaseId: string;
  unitId: string;
  propertyId: string;
  monthlyRent: number;
  endDate: string;
}

interface PreviewContext {
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  propertyName: string;
  propertyLocation: string;
  unitNumber: string;
  unitFloor: number | null;
}

interface PropertyDefaults {
  cleaningFee: number;
  paintingFee: number;
  earlyTerminationRate: number; // decimal (e.g. 0.12)
}

const newRowId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Math.random().toString(36).slice(2)}-${Date.now()}`;

export default function MoveOutPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invoices, setInvoices] = useState<OutstandingInvoice[]>([]);
  const [invoiceActions, setInvoiceActions] = useState<Record<string, InvoiceAction>>({});
  const [settlementAmounts, setSettlementAmounts] = useState<Record<string, string>>({});
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [resolvedParams, setResolvedParams] = useState<{ locale: string; id: string } | null>(null);
  const [leaseCtx, setLeaseCtx] = useState<LeaseContext | null>(null);
  const [previewCtx, setPreviewCtx] = useState<PreviewContext | null>(null);
  const [propertyDefaults, setPropertyDefaults] = useState<PropertyDefaults | null>(null);
  const [vacateDate, setVacateDate] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [finalInspection, setFinalInspection] = useState(false);
  const [keysReturned, setKeysReturned] = useState(false);
  const [depositStatus, setDepositStatus] = useState("pending");
  const [commissionPreview, setCommissionPreview] = useState<EarlyTerminationCommissionPreview | null>(null);
  const [loadingCommission, setLoadingCommission] = useState(false);
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [feesInitialized, setFeesInitialized] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [createdInvoiceNumber, setCreatedInvoiceNumber] = useState<string | null>(null);

  // Resolve params, fetch lease/property/tenant context, outstanding invoices
  useEffect(() => {
    const init = async () => {
      const { locale, id } = await params;
      setResolvedParams({ locale, id });

      const supabase = createClient();

      const { data: activeLease } = await supabase
        .from("leases")
        .select(
          `id, unit_id, end_date, monthly_rent,
           tenants!inner(full_name, phone, email),
           units!inner(unit_number, floor, property_id,
             properties!inner(name, location, cleaning_fee_default, painting_fee_default, early_termination_rate))`,
        )
        .eq("tenant_id", id)
        .eq("is_active", true)
        .single();

      if (activeLease) {
        const unit = (activeLease.units as unknown) as {
          unit_number: string;
          floor: number | null;
          property_id: string;
          properties: {
            name: string;
            location: string;
            cleaning_fee_default: string | number;
            painting_fee_default: string | number;
            early_termination_rate: string | number;
          };
        };
        const tenant = (activeLease.tenants as unknown) as {
          full_name: string;
          phone: string;
          email: string;
        };

        setLeaseCtx({
          leaseId: activeLease.id,
          unitId: activeLease.unit_id,
          propertyId: unit.property_id,
          monthlyRent: Number(activeLease.monthly_rent || 0),
          endDate: activeLease.end_date as string,
        });
        setPreviewCtx({
          tenantName: tenant.full_name,
          tenantPhone: tenant.phone || "",
          tenantEmail: tenant.email || "",
          propertyName: unit.properties.name,
          propertyLocation: unit.properties.location || "",
          unitNumber: unit.unit_number,
          unitFloor: unit.floor,
        });
        setPropertyDefaults({
          cleaningFee: Number(unit.properties.cleaning_fee_default || 0),
          paintingFee: Number(unit.properties.painting_fee_default || 0),
          earlyTerminationRate: Number(unit.properties.early_termination_rate || 0),
        });

        const { data: outstandingInvoices } = await supabase
          .from("invoices")
          .select("id, amount, paid_amount, due_date, status, period_start, period_end, lease_id, tenant_id, unit_id")
          .eq("lease_id", activeLease.id)
          .eq("invoice_type", "rent")
          .in("status", ["pending", "overdue", "partial"])
          .order("due_date", { ascending: true });

        if (outstandingInvoices && outstandingInvoices.length > 0) {
          setInvoices(outstandingInvoices);
          const defaults: Record<string, InvoiceAction> = {};
          outstandingInvoices.forEach((inv) => {
            defaults[inv.id] = "leave_open";
          });
          setInvoiceActions(defaults);
        }
      }
      setLoadingInvoices(false);
    };
    init();
  }, [params]);

  // Refresh the early-termination commission catch-up whenever the vacate
  // date changes. The form gates rendering on `vacateDate`, so we don't need
  // to clear the preview imperatively when it goes blank.
  useEffect(() => {
    if (!leaseCtx || !vacateDate) return;
    let cancelled = false;
    const run = async () => {
      setLoadingCommission(true);
      try {
        const supabase = createClient();
        const preview = await getEarlyTerminationCommissionForLease(
          supabase,
          leaseCtx.leaseId,
          vacateDate,
        );
        if (!cancelled) setCommissionPreview(preview);
      } catch {
        if (!cancelled) setCommissionPreview(null);
      } finally {
        if (!cancelled) setLoadingCommission(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [leaseCtx, vacateDate]);

  // Seed the fee rows once the property defaults are loaded. Cleaning and
  // painting are always present so the user sees them prefilled.
  useEffect(() => {
    if (feesInitialized || !propertyDefaults) return;
    setFees([
      {
        id: newRowId(),
        kind: "cleaning",
        description: t("moveOutFees.cleaningLabel"),
        amount: String(propertyDefaults.cleaningFee || 0),
      },
      {
        id: newRowId(),
        kind: "painting",
        description: t("moveOutFees.paintingLabel"),
        amount: String(propertyDefaults.paintingFee || 0),
      },
    ]);
    setFeesInitialized(true);
  }, [propertyDefaults, feesInitialized, t]);

  // Auto-populate (and refresh) the early-termination fee whenever the
  // vacate date moves into / out of the contract window. The fee is
  // 12% (configurable per property) × remaining months × monthly rent.
  // Stops touching the row if the user has manually edited it.
  const [earlyTermTouched, setEarlyTermTouched] = useState(false);
  useEffect(() => {
    if (!leaseCtx || !propertyDefaults) return;

    const applicable =
      vacateDate &&
      leaseCtx.endDate &&
      vacateDate < leaseCtx.endDate &&
      commissionPreview?.monthsRemainingAtVacate
        ? commissionPreview.monthsRemainingAtVacate
        : 0;

    setFees((prev) => {
      const hasRow = prev.some((f) => f.kind === "early_termination");

      if (!applicable) {
        return hasRow ? prev.filter((f) => f.kind !== "early_termination") : prev;
      }

      const months = commissionPreview?.monthsRemainingAtVacate || 0;
      const computed = round2(
        months * leaseCtx.monthlyRent * propertyDefaults.earlyTerminationRate,
      );

      if (hasRow) {
        if (earlyTermTouched) return prev;
        return prev.map((f) =>
          f.kind === "early_termination"
            ? { ...f, amount: String(computed) }
            : f,
        );
      }

      return [
        ...prev,
        {
          id: newRowId(),
          kind: "early_termination",
          description: t("moveOutFees.earlyTerminationLabel"),
          amount: String(computed),
        },
      ];
    });
  }, [
    leaseCtx,
    propertyDefaults,
    vacateDate,
    commissionPreview,
    earlyTermTouched,
    t,
  ]);

  const setAction = (invoiceId: string, action: InvoiceAction) => {
    setInvoiceActions((prev) => ({ ...prev, [invoiceId]: action }));
  };

  const setAllActions = (action: InvoiceAction) => {
    const updated: Record<string, InvoiceAction> = {};
    invoices.forEach((inv) => {
      updated[inv.id] = action;
    });
    setInvoiceActions(updated);
  };

  const outstanding = (inv: OutstandingInvoice) => {
    return Number(inv.amount) - Number(inv.paid_amount || 0);
  };

  const updateFee = (id: string, patch: Partial<FeeRow>) => {
    setFees((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        if (f.kind === "early_termination" && patch.amount !== undefined) {
          setEarlyTermTouched(true);
        }
        return { ...f, ...patch };
      }),
    );
  };

  const removeFee = (id: string) => {
    setFees((prev) => prev.filter((f) => f.id !== id));
  };

  const addCustomFee = () => {
    setFees((prev) => [
      ...prev,
      {
        id: newRowId(),
        kind: "custom",
        description: "",
        amount: "",
      },
    ]);
  };

  const feesForInvoice = useMemo(
    () =>
      fees
        .map((f, idx) => ({
          ...f,
          amountNum: Number(f.amount || 0),
          sortOrder: idx,
        }))
        .filter((f) => f.amountNum > 0 && f.description.trim().length > 0),
    [fees],
  );

  const feesTotal = useMemo(
    () => feesForInvoice.reduce((sum, f) => sum + f.amountNum, 0),
    [feesForInvoice],
  );

  const validateBeforePreview = (): string | null => {
    if (!vacateDate) return t("moveOutFees.errors.vacateDateRequired");
    if (!reason) return t("moveOutFees.errors.reasonRequired");
    for (const f of fees) {
      const amt = Number(f.amount || 0);
      if (f.kind === "custom") {
        if (!f.description.trim() && amt > 0) {
          return t("moveOutFees.errors.customDescriptionRequired");
        }
      }
      if (amt < 0) return t("moveOutFees.errors.negativeAmount");
    }
    return null;
  };

  const openPreview = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const validationError = validateBeforePreview();
    if (validationError) {
      setError(validationError);
      return;
    }
    setPreviewOpen(true);
  };

  const confirmMoveOut = async () => {
    setLoading(true);
    setError("");

    if (!resolvedParams || !leaseCtx) {
      setError("Missing context");
      setLoading(false);
      return;
    }
    const { locale, id } = resolvedParams;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let invoiceId: string | null = null;
    let invoiceNumber: string | null = null;

    // Issue the move-out invoice first so the rest of the flow can fail
    // without leaving a partially-archived tenant.
    if (feesForInvoice.length > 0) {
      const { data: numberData, error: numberError } = await supabase.rpc(
        "next_move_out_invoice_number",
        { p_property_id: leaseCtx.propertyId },
      );
      if (numberError) {
        setError(numberError.message);
        setLoading(false);
        return;
      }
      invoiceNumber = numberData as string;

      const today = new Date().toISOString().split("T")[0];
      const { data: invoiceRow, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          lease_id: leaseCtx.leaseId,
          tenant_id: id,
          unit_id: leaseCtx.unitId,
          invoice_type: "move_out",
          invoice_number: invoiceNumber,
          amount: feesTotal,
          due_date: vacateDate,
          issued_date: today,
          status: "pending",
          notes: notes || null,
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (invoiceError || !invoiceRow) {
        setError(invoiceError?.message || "Failed to create invoice");
        setLoading(false);
        return;
      }
      invoiceId = invoiceRow.id;

      const itemsPayload = feesForInvoice.map((f) => ({
        invoice_id: invoiceId!,
        kind: f.kind,
        description: f.description.trim(),
        amount: f.amountNum,
        sort_order: f.sortOrder,
      }));
      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(itemsPayload);
      if (itemsError) {
        setError(itemsError.message);
        setLoading(false);
        return;
      }
    }

    const { error: tenantError } = await supabase
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", id);
    if (tenantError) {
      setError(tenantError.message);
      setLoading(false);
      return;
    }

    const { error: leaseError } = await supabase
      .from("leases")
      .update({
        is_active: false,
        vacate_date: vacateDate,
        vacate_reason: reason,
        vacate_notes: notes || null,
        final_inspection: finalInspection,
        keys_returned: keysReturned,
        deposit_status: depositStatus,
      })
      .eq("id", leaseCtx.leaseId);
    if (leaseError) {
      setError(leaseError.message);
      setLoading(false);
      return;
    }

    const { error: unitError } = await supabase
      .from("units")
      .update({ status: "vacant" })
      .eq("id", leaseCtx.unitId);
    if (unitError) {
      setError(unitError.message);
      setLoading(false);
      return;
    }

    // Resolve outstanding rent invoices based on user's choices.
    // "leave_open" invoices are intentionally untouched — they stay
    // pending/overdue and remain collectable after the move-out.
    const writeOffIds = Object.entries(invoiceActions)
      .filter(([, action]) => action === "write_off")
      .map(([id]) => id);
    const cancelIds = Object.entries(invoiceActions)
      .filter(([, action]) => action === "cancel")
      .map(([id]) => id);
    const settleIds = Object.entries(invoiceActions)
      .filter(([, action]) => action === "settle")
      .map(([id]) => id);

    if (writeOffIds.length > 0) {
      await supabase
        .from("invoices")
        .update({
          status: "written_off",
          notes: `Written off on move-out (${vacateDate})`,
          updated_at: new Date().toISOString(),
        })
        .in("id", writeOffIds);
    }
    if (cancelIds.length > 0) {
      await supabase
        .from("invoices")
        .update({
          status: "cancelled",
          notes: `Cancelled on move-out (${vacateDate})`,
          updated_at: new Date().toISOString(),
        })
        .in("id", cancelIds);
    }

    for (const invId of settleIds) {
      const inv = invoices.find((i) => i.id === invId);
      if (!inv) continue;
      const settleAmount = Number(settlementAmounts[invId] || 0);
      if (settleAmount <= 0) continue;
      const currentPaid = Number(inv.paid_amount || 0);
      const newPaidAmount = currentPaid + settleAmount;

      await supabase.from("payments").insert({
        lease_id: inv.lease_id,
        tenant_id: inv.tenant_id,
        amount: settleAmount,
        payment_date: vacateDate,
        method: "cash",
        notes: `Settlement on move-out (${vacateDate})`,
      });

      const writeOffAmount = Number(inv.amount) - newPaidAmount;
      await supabase
        .from("invoices")
        .update({
          status: "written_off",
          paid_amount: newPaidAmount,
          paid_date: vacateDate,
          notes: `Settled ${settleAmount.toFixed(2)} ${CURRENCY.code}, wrote off ${writeOffAmount.toFixed(2)} ${CURRENCY.code} on move-out (${vacateDate})`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invId);
    }

    setCreatedInvoiceId(invoiceId);
    setCreatedInvoiceNumber(invoiceNumber);
    setLoading(false);

    if (!invoiceId) {
      router.push(`/${locale}/tenants`);
      router.refresh();
    }
    // When an invoice exists, leave the user on the success screen so they
    // can download the PDF before navigating away.
  };

  const totalOutstanding = invoices.reduce((sum, inv) => sum + outstanding(inv), 0);
  const writeOffTotal = invoices
    .filter((inv) => invoiceActions[inv.id] === "write_off")
    .reduce((sum, inv) => sum + outstanding(inv), 0);
  const cancelTotal = invoices
    .filter((inv) => invoiceActions[inv.id] === "cancel")
    .reduce((sum, inv) => sum + outstanding(inv), 0);
  const leaveOpenTotal = invoices
    .filter((inv) => (invoiceActions[inv.id] || "leave_open") === "leave_open")
    .reduce((sum, inv) => sum + outstanding(inv), 0);
  const settleCollectTotal = invoices
    .filter((inv) => invoiceActions[inv.id] === "settle")
    .reduce((sum, inv) => sum + Number(settlementAmounts[inv.id] || 0), 0);
  const settleWriteOffTotal = invoices
    .filter((inv) => invoiceActions[inv.id] === "settle")
    .reduce((sum, inv) => {
      const bal = outstanding(inv);
      const settle = Number(settlementAmounts[inv.id] || 0);
      return sum + Math.max(bal - settle, 0);
    }, 0);

  const fmt = (n: number) =>
    n.toLocaleString("en-OM", { minimumFractionDigits: 2 });

  // Successful submission with an invoice → show a small confirmation card
  // with a Download PDF link before redirecting.
  if (createdInvoiceId && resolvedParams) {
    return (
      <div className="max-w-2xl">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2 text-success">
            <FileText className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {t("moveOutFees.success.title")}
            </h2>
          </div>
          <p className="text-sm text-text-secondary">
            {t("moveOutFees.success.description", {
              invoiceNumber: createdInvoiceNumber || "",
            })}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={`/api/invoices/${createdInvoiceId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors inline-flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {t("moveOutFees.success.downloadPdf")}
            </a>
            <button
              type="button"
              onClick={() => {
                router.push(`/${resolvedParams.locale}/tenants`);
                router.refresh();
              }}
              className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
            >
              {t("moveOutFees.success.backToTenants")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary font-display flex items-center gap-2">
          <LogOut className="h-6 w-6 text-text-secondary" />
          {t("moveOut")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t("moveOutDescription")}
        </p>
      </div>

      <form onSubmit={openPreview} className="space-y-5">
        {/* Move-out Details */}
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-medium text-text-primary uppercase tracking-wider">
            {t("moveOutDetails")}
          </h3>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("vacateDate")} <span className="text-destructive">*</span>
            </label>
            <input
              name="vacate_date"
              type="date"
              required
              value={vacateDate}
              onChange={(e) => setVacateDate(e.target.value)}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
            />
          </div>

          {/* Early-termination commission preview (owner commission, not tenant fee) */}
          {vacateDate && commissionPreview && commissionPreview.applicable && commissionPreview.remainingCommission > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-warning">
                  {t("earlyTerminationCommission.title")}
                </span>
                <span className="font-mono tabular-nums text-warning text-base font-semibold">
                  {fmt(commissionPreview.remainingCommission)} {CURRENCY.code}
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                {t("earlyTerminationCommission.description")}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-secondary pt-1">
                <div className="flex justify-between">
                  <span>{t("earlyTerminationCommission.contractMonths")}</span>
                  <span className="font-mono tabular-nums text-text-primary">
                    {commissionPreview.contractMonths}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("earlyTerminationCommission.monthsRemaining")}</span>
                  <span className="font-mono tabular-nums text-text-primary">
                    {commissionPreview.monthsRemainingAtVacate}
                  </span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span>
                    {t("earlyTerminationCommission.formula", {
                      months: commissionPreview.monthsRemainingAtVacate,
                      rent: fmt(commissionPreview.monthlyRent),
                      rate: commissionPreview.commissionRate,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}
          {vacateDate && loadingCommission && !commissionPreview && (
            <div className="rounded-lg border border-border/40 bg-surface-elevated/30 p-3 text-xs text-text-secondary flex items-center gap-2">
              <Spinner sizeClassName="h-3 w-3" />
              {t("earlyTerminationCommission.calculating")}
            </div>
          )}

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("reason")} <span className="text-destructive">*</span>
            </label>
            <select
              name="reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="">{t("selectReason")}</option>
              <option value="end_of_lease">{t("reasons.endOfLease")}</option>
              <option value="relocation">{t("reasons.relocation")}</option>
              <option value="non_payment">{t("reasons.nonPayment")}</option>
              <option value="personal">{t("reasons.personal")}</option>
              <option value="other">{t("reasons.other")}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("moveOutNotes")}
            </label>
            <textarea
              name="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder={t("moveOutNotesPlaceholder")}
            />
          </div>
        </div>

        {/* Move-out Fees */}
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-primary uppercase tracking-wider">
              {t("moveOutFees.title")}
            </h3>
            <span className="font-mono tabular-nums text-text-primary text-base font-semibold">
              {fmt(feesTotal)} {CURRENCY.code}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            {t("moveOutFees.description")}
          </p>

          <div className="space-y-2.5">
            {fees.map((fee) => {
              const isCustom = fee.kind === "custom";
              const isEarlyTerm = fee.kind === "early_termination";
              return (
                <div
                  key={fee.id}
                  className={`p-3 rounded-lg border ${
                    isEarlyTerm
                      ? "bg-warning/5 border-warning/20"
                      : "bg-surface-elevated/40 border-border/40"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-2">
                      {isCustom ? (
                        <input
                          type="text"
                          value={fee.description}
                          onChange={(e) =>
                            updateFee(fee.id, { description: e.target.value })
                          }
                          placeholder={t("moveOutFees.customDescriptionPlaceholder")}
                          className="w-full h-9 bg-surface border border-border/60 rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                        />
                      ) : (
                        <p className="text-sm text-text-primary font-medium">
                          {fee.description}
                          {isEarlyTerm && commissionPreview?.monthsRemainingAtVacate && propertyDefaults ? (
                            <span className="block text-[11px] text-text-secondary font-normal mt-0.5">
                              {t("moveOutFees.earlyTerminationFormula", {
                                months: commissionPreview.monthsRemainingAtVacate,
                                rent: fmt(leaseCtx?.monthlyRent || 0),
                                rate: (propertyDefaults.earlyTerminationRate * 100).toFixed(2),
                              })}
                            </span>
                          ) : null}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={fee.amount}
                          onChange={(e) =>
                            updateFee(fee.id, { amount: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-full h-9 bg-surface border border-border/60 rounded-md px-3 text-sm text-text-primary font-mono tabular-nums focus:outline-none focus:border-accent transition-colors"
                        />
                        <span className="text-xs text-text-secondary font-mono">
                          {CURRENCY.code}
                        </span>
                      </div>
                    </div>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => removeFee(fee.id)}
                        aria-label={tc("delete")}
                        className="p-1.5 rounded-md text-text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addCustomFee}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-dashed border-border/60 text-text-secondary hover:text-text-primary hover:border-border transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("moveOutFees.addCustom")}
          </button>
        </div>

        {/* Outstanding Invoices Resolution */}
        {!loadingInvoices && invoices.length > 0 && (
          <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-text-primary uppercase tracking-wider">
                {t("outstandingInvoices")}
              </h3>
              <span className="text-xs bg-destructive/12 text-destructive px-2 py-0.5 rounded-md font-mono font-semibold border border-destructive/20">
                {fmt(totalOutstanding)} {CURRENCY.code}
              </span>
            </div>

            <p className="text-xs text-text-secondary">
              {t("invoiceResolutionDescription")}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-secondary">{t("bulkAction")}:</span>
              <button
                type="button"
                onClick={() => setAllActions("leave_open")}
                className="text-xs px-2.5 py-1 rounded-md border border-border/50 text-info hover:bg-info/10 hover:border-info/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {t("invoiceActionLeaveOpen")}
              </button>
              <button
                type="button"
                onClick={() => setAllActions("cancel")}
                className="text-xs px-2.5 py-1 rounded-md border border-border/50 text-text-secondary hover:text-text-primary hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {t("invoiceActionCancel")}
              </button>
              <button
                type="button"
                onClick={() => setAllActions("write_off")}
                className="text-xs px-2.5 py-1 rounded-md border border-border/50 text-warning hover:bg-warning/10 hover:border-warning/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {t("invoiceActionWriteOff")}
              </button>
            </div>

            <div className="space-y-2.5">
              {invoices.map((inv) => {
                const bal = outstanding(inv);
                const action = invoiceActions[inv.id] || "leave_open";
                return (
                  <div
                    key={inv.id}
                    className={`p-3.5 rounded-lg border transition-colors ${
                      action === "write_off"
                        ? "bg-warning/5 border-warning/20"
                        : action === "cancel"
                        ? "bg-surface-elevated/30 border-border/30 opacity-60"
                        : action === "settle"
                        ? "bg-success/5 border-success/20"
                        : "bg-info/5 border-info/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary font-mono tabular-nums">
                          {fmt(bal)} {CURRENCY.code}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {t("dueLabel")}: {new Date(inv.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          {inv.period_start && inv.period_end && (
                            <span className="text-border mx-1">&middot;</span>
                          )}
                          {inv.period_start && inv.period_end && (
                            <span>
                              {new Date(inv.period_start).toLocaleDateString("en-GB", { month: "short" })}
                              {" - "}
                              {new Date(inv.period_end).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                            </span>
                          )}
                        </p>
                        {Number(inv.paid_amount || 0) > 0 && (
                          <p className="text-[10px] text-success mt-0.5">
                            {t("partiallyPaid")}: {fmt(Number(inv.paid_amount))} / {fmt(Number(inv.amount))}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          inv.status === "overdue"
                            ? "bg-destructive/10 text-destructive"
                            : inv.status === "partial"
                            ? "bg-info/10 text-info"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAction(inv.id, "leave_open")}
                        aria-pressed={action === "leave_open"}
                        className={`text-[11px] py-1.5 px-2 rounded-md border font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          action === "leave_open"
                            ? "bg-info/10 border-info/40 text-info"
                            : "border-border/40 text-text-secondary hover:text-text-primary hover:border-border"
                        }`}
                      >
                        {t("invoiceActionLeaveOpen")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAction(inv.id, "settle")}
                        aria-pressed={action === "settle"}
                        className={`text-[11px] py-1.5 px-2 rounded-md border font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          action === "settle"
                            ? "bg-success/10 border-success/40 text-success"
                            : "border-border/40 text-text-secondary hover:text-text-primary hover:border-border"
                        }`}
                      >
                        {t("invoiceActionSettle")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAction(inv.id, "write_off")}
                        aria-pressed={action === "write_off"}
                        className={`text-[11px] py-1.5 px-2 rounded-md border font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          action === "write_off"
                            ? "bg-warning/10 border-warning/40 text-warning"
                            : "border-border/40 text-text-secondary hover:text-text-primary hover:border-border"
                        }`}
                      >
                        {t("invoiceActionWriteOff")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAction(inv.id, "cancel")}
                        aria-pressed={action === "cancel"}
                        className={`text-[11px] py-1.5 px-2 rounded-md border font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          action === "cancel"
                            ? "bg-surface-elevated border-border text-text-primary"
                            : "border-border/40 text-text-secondary hover:text-text-primary hover:border-border"
                        }`}
                      >
                        {t("invoiceActionCancel")}
                      </button>
                    </div>

                    {action === "settle" && (
                      <div className="mt-2.5 p-3 rounded-lg bg-success/5 border border-success/15 space-y-2">
                        <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                          {t("settlementAmount")} ({CURRENCY.code})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={bal}
                          value={settlementAmounts[inv.id] || ""}
                          onChange={(e) =>
                            setSettlementAmounts((prev) => ({
                              ...prev,
                              [inv.id]: e.target.value,
                            }))
                          }
                          placeholder={`${t("invoiceSettlePlaceholder")} ${fmt(bal)}`}
                          className="w-full h-9 bg-surface border border-border/60 rounded-md px-3 text-sm text-text-primary font-mono focus:outline-none focus:border-success/50 focus:ring-1 focus:ring-success/20 transition-all"
                        />
                        {settlementAmounts[inv.id] && Number(settlementAmounts[inv.id]) > 0 && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-success font-medium">
                              {t("settleCollect")}: {fmt(Number(settlementAmounts[inv.id]))} {CURRENCY.code}
                            </span>
                            <span className="text-warning font-medium">
                              {t("settleWriteOff")}: {fmt(Math.max(bal - Number(settlementAmounts[inv.id]), 0))} {CURRENCY.code}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-lg bg-surface-elevated/50 border border-border/30 space-y-1.5">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                {t("resolutionSummary")}
              </p>
              {leaveOpenTotal > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-info">{t("keptPending")}</span>
                  <span className="font-mono font-medium text-info tabular-nums ltr-nums">
                    {fmt(leaveOpenTotal)} {CURRENCY.code}
                  </span>
                </div>
              )}
              {settleCollectTotal > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-success">{t("settleCollect")}</span>
                  <span className="font-mono font-medium text-success tabular-nums">
                    {fmt(settleCollectTotal)} {CURRENCY.code}
                  </span>
                </div>
              )}
              {(writeOffTotal > 0 || settleWriteOffTotal > 0) && (
                <div className="flex justify-between text-xs">
                  <span className="text-warning">{t("invoiceActionWriteOff")}</span>
                  <span className="font-mono font-medium text-warning tabular-nums">
                    {fmt(writeOffTotal + settleWriteOffTotal)} {CURRENCY.code}
                  </span>
                </div>
              )}
              {cancelTotal > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">{t("invoiceActionCancel")}</span>
                  <span className="font-mono font-medium text-text-secondary tabular-nums line-through">
                    {fmt(cancelTotal)} {CURRENCY.code}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {loadingInvoices && (
          <div className="bg-surface border border-border rounded-lg p-6">
            <Spinner label={tc("loading")} sizeClassName="h-5 w-5" />
          </div>
        )}

        {/* Checklist */}
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-medium text-text-primary uppercase tracking-wider">
            {t("moveOutChecklist")}
          </h3>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={finalInspection}
                onChange={(e) => setFinalInspection(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface-elevated text-accent focus:ring-accent"
              />
              <span className="text-sm text-text-primary">
                {t("finalInspection")}
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={keysReturned}
                onChange={(e) => setKeysReturned(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface-elevated text-accent focus:ring-accent"
              />
              <span className="text-sm text-text-primary">
                {t("keysReturned")}
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("depositStatus")}
            </label>
            <select
              value={depositStatus}
              onChange={(e) => setDepositStatus(e.target.value)}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="pending">{t("depositStatuses.pending")}</option>
              <option value="refunded">{t("depositStatuses.refunded")}</option>
              <option value="deducted">{t("depositStatuses.deducted")}</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            {t("moveOutFees.reviewAndConfirm")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>

      {previewOpen && previewCtx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-lg w-full max-w-2xl my-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface">
              <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t("moveOutFees.preview.title")}
              </h2>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                aria-label={tc("close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="text-xs text-text-secondary">
                {t("moveOutFees.preview.invoiceNumber")}:{" "}
                <span className="font-mono text-text-primary">
                  {t("moveOutFees.preview.invoiceNumberPending")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <p className="uppercase tracking-wider text-text-secondary text-[10px]">
                    {t("moveOutFees.preview.billTo")}
                  </p>
                  <p className="text-sm font-medium text-text-primary">
                    {previewCtx.tenantName}
                  </p>
                  {previewCtx.tenantPhone && (
                    <p className="text-text-secondary">{previewCtx.tenantPhone}</p>
                  )}
                  {previewCtx.tenantEmail && (
                    <p className="text-text-secondary">{previewCtx.tenantEmail}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="uppercase tracking-wider text-text-secondary text-[10px]">
                    {t("moveOutFees.preview.unit")}
                  </p>
                  <p className="text-sm font-medium text-text-primary">
                    {previewCtx.propertyName}
                  </p>
                  {previewCtx.propertyLocation && (
                    <p className="text-text-secondary">{previewCtx.propertyLocation}</p>
                  )}
                  <p className="text-text-secondary">
                    {t("moveOutFees.preview.unitNumber")}: {previewCtx.unitNumber}
                    {previewCtx.unitFloor !== null && previewCtx.unitFloor !== undefined
                      ? ` · ${t("moveOutFees.preview.floor")} ${previewCtx.unitFloor}`
                      : ""}
                  </p>
                  <p className="text-text-secondary">
                    {t("moveOutFees.preview.vacateDate")}:{" "}
                    {new Date(vacateDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-elevated/60">
                    <tr>
                      <th className="text-start font-semibold text-[11px] uppercase tracking-wider text-text-secondary px-3 py-2">
                        {t("moveOutFees.preview.description")}
                      </th>
                      <th className="text-end font-semibold text-[11px] uppercase tracking-wider text-text-secondary px-3 py-2 w-32">
                        {t("moveOutFees.preview.amount")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {feesForInvoice.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-4 text-center text-xs text-text-secondary">
                          {t("moveOutFees.preview.noLineItems")}
                        </td>
                      </tr>
                    )}
                    {feesForInvoice.map((f) => (
                      <tr key={f.id} className="border-t border-border/40">
                        <td className="px-3 py-2 text-text-primary">{f.description}</td>
                        <td className="px-3 py-2 text-end font-mono tabular-nums text-text-primary">
                          {fmt(f.amountNum)} {CURRENCY.code}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-surface-elevated/40">
                      <td className="px-3 py-2.5 font-semibold text-text-primary">
                        {t("moveOutFees.preview.totalDue")}
                      </td>
                      <td className="px-3 py-2.5 text-end font-mono tabular-nums font-semibold text-text-primary">
                        {fmt(feesTotal)} {CURRENCY.code}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center gap-3 sticky bottom-0 bg-surface">
              <button
                type="button"
                onClick={confirmMoveOut}
                disabled={loading}
                className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {loading ? tc("loading") : t("moveOutFees.preview.confirm")}
              </button>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                disabled={loading}
                className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors disabled:opacity-50"
              >
                {t("moveOutFees.preview.back")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
