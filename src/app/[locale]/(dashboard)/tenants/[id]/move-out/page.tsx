"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LogOut, AlertTriangle } from "lucide-react";
import { CURRENCY } from "@/lib/currency";

interface OutstandingInvoice {
  id: string;
  amount: string;
  paid_amount: string;
  due_date: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
}

type InvoiceAction = "leave_open" | "write_off" | "cancel";

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
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [resolvedParams, setResolvedParams] = useState<{ locale: string; id: string } | null>(null);

  // Resolve params and fetch outstanding invoices
  useEffect(() => {
    const init = async () => {
      const { locale, id } = await params;
      setResolvedParams({ locale, id });

      const supabase = createClient();

      // Get tenant's active lease
      const { data: activeLease } = await supabase
        .from("leases")
        .select("id")
        .eq("tenant_id", id)
        .eq("is_active", true)
        .single();

      if (activeLease) {
        // Fetch outstanding invoices for this lease
        const { data: outstandingInvoices } = await supabase
          .from("invoices")
          .select("id, amount, paid_amount, due_date, status, period_start, period_end")
          .eq("lease_id", activeLease.id)
          .in("status", ["pending", "overdue", "partial"])
          .order("due_date", { ascending: true });

        if (outstandingInvoices && outstandingInvoices.length > 0) {
          setInvoices(outstandingInvoices);
          // Default all to "leave_open"
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!resolvedParams) return;
    const { locale, id } = resolvedParams;

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    // Get tenant's active lease to find the unit
    const { data: activeLease } = await supabase
      .from("leases")
      .select("id, unit_id")
      .eq("tenant_id", id)
      .eq("is_active", true)
      .single();

    // Update tenant status to archived
    const { error: tenantError } = await supabase
      .from("tenants")
      .update({
        status: "archived",
      })
      .eq("id", id);

    if (tenantError) {
      setError(tenantError.message);
      setLoading(false);
      return;
    }

    // Deactivate the lease
    if (activeLease) {
      const vacateDate = formData.get("vacate_date") as string;

      const { error: leaseError } = await supabase
        .from("leases")
        .update({
          is_active: false,
          vacate_date: vacateDate,
          vacate_reason: formData.get("reason") as string,
          vacate_notes: formData.get("notes") as string,
          final_inspection: formData.get("final_inspection") === "on",
          keys_returned: formData.get("keys_returned") === "on",
          deposit_status: formData.get("deposit_status") as string,
        })
        .eq("id", activeLease.id);

      if (leaseError) {
        setError(leaseError.message);
        setLoading(false);
        return;
      }

      // Set unit status to vacant
      const { error: unitError } = await supabase
        .from("units")
        .update({ status: "vacant" })
        .eq("id", activeLease.unit_id);

      if (unitError) {
        setError(unitError.message);
        setLoading(false);
        return;
      }

      // Resolve outstanding invoices based on user's choices
      const writeOffIds = Object.entries(invoiceActions)
        .filter(([, action]) => action === "write_off")
        .map(([id]) => id);

      const cancelIds = Object.entries(invoiceActions)
        .filter(([, action]) => action === "cancel")
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
    }

    router.push(`/${locale}/tenants`);
    router.refresh();
  };

  const outstanding = (inv: OutstandingInvoice) => {
    return Number(inv.amount) - Number(inv.paid_amount || 0);
  };

  const totalOutstanding = invoices.reduce((sum, inv) => sum + outstanding(inv), 0);
  const writeOffTotal = invoices
    .filter((inv) => invoiceActions[inv.id] === "write_off")
    .reduce((sum, inv) => sum + outstanding(inv), 0);
  const cancelTotal = invoices
    .filter((inv) => invoiceActions[inv.id] === "cancel")
    .reduce((sum, inv) => sum + outstanding(inv), 0);
  const leaveOpenTotal = invoices
    .filter((inv) => invoiceActions[inv.id] === "leave_open")
    .reduce((sum, inv) => sum + outstanding(inv), 0);

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

      <form onSubmit={handleSubmit} className="space-y-5">
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
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("reason")} <span className="text-destructive">*</span>
            </label>
            <select
              name="reason"
              required
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
              className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder={t("moveOutNotesPlaceholder")}
            />
          </div>
        </div>

        {/* Outstanding Invoices Resolution */}
        {!loadingInvoices && invoices.length > 0 && (
          <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-text-primary uppercase tracking-wider">
                {t("outstandingInvoices")}
              </h3>
              <span className="text-xs bg-destructive/12 text-destructive px-2 py-0.5 rounded-md font-mono font-semibold border border-destructive/20">
                {totalOutstanding.toLocaleString("en-OM", { minimumFractionDigits: 2 })} {CURRENCY.code}
              </span>
            </div>

            <p className="text-xs text-text-secondary">
              {t("invoiceResolutionDescription")}
            </p>

            {/* Bulk actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-secondary">{t("bulkAction")}:</span>
              <button
                type="button"
                onClick={() => setAllActions("leave_open")}
                className="text-xs px-2.5 py-1 rounded-md border border-border/50 text-text-secondary hover:text-text-primary hover:border-border transition-colors"
              >
                {t("invoiceActionLeaveOpen")}
              </button>
              <button
                type="button"
                onClick={() => setAllActions("write_off")}
                className="text-xs px-2.5 py-1 rounded-md border border-border/50 text-warning hover:bg-warning/10 hover:border-warning/30 transition-colors"
              >
                {t("invoiceActionWriteOff")}
              </button>
              <button
                type="button"
                onClick={() => setAllActions("cancel")}
                className="text-xs px-2.5 py-1 rounded-md border border-border/50 text-text-secondary hover:text-text-primary hover:border-border transition-colors"
              >
                {t("invoiceActionCancel")}
              </button>
            </div>

            {/* Invoice list */}
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
                        : "bg-surface-elevated/50 border-border/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary font-mono ltr-nums">
                          {bal.toLocaleString("en-OM", { minimumFractionDigits: 2 })} {CURRENCY.code}
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
                            {t("partiallyPaid")}: {Number(inv.paid_amount).toLocaleString("en-OM", { minimumFractionDigits: 2 })} / {Number(inv.amount).toLocaleString("en-OM", { minimumFractionDigits: 2 })}
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

                    {/* Action selector */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAction(inv.id, "leave_open")}
                        className={`text-[11px] py-1.5 px-2 rounded-md border font-medium transition-all ${
                          action === "leave_open"
                            ? "bg-accent/10 border-accent/40 text-accent"
                            : "border-border/40 text-text-secondary hover:text-text-primary hover:border-border"
                        }`}
                      >
                        {t("invoiceActionLeaveOpen")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAction(inv.id, "write_off")}
                        className={`text-[11px] py-1.5 px-2 rounded-md border font-medium transition-all ${
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
                        className={`text-[11px] py-1.5 px-2 rounded-md border font-medium transition-all ${
                          action === "cancel"
                            ? "bg-surface-elevated border-border text-text-primary"
                            : "border-border/40 text-text-secondary hover:text-text-primary hover:border-border"
                        }`}
                      >
                        {t("invoiceActionCancel")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resolution summary */}
            <div className="p-3 rounded-lg bg-surface-elevated/50 border border-border/30 space-y-1.5">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                {t("resolutionSummary")}
              </p>
              {leaveOpenTotal > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">{t("invoiceActionLeaveOpen")}</span>
                  <span className="font-mono font-medium text-accent ltr-nums">
                    {leaveOpenTotal.toLocaleString("en-OM", { minimumFractionDigits: 2 })} {CURRENCY.code}
                  </span>
                </div>
              )}
              {writeOffTotal > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-warning">{t("invoiceActionWriteOff")}</span>
                  <span className="font-mono font-medium text-warning ltr-nums">
                    {writeOffTotal.toLocaleString("en-OM", { minimumFractionDigits: 2 })} {CURRENCY.code}
                  </span>
                </div>
              )}
              {cancelTotal > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">{t("invoiceActionCancel")}</span>
                  <span className="font-mono font-medium text-text-secondary ltr-nums line-through">
                    {cancelTotal.toLocaleString("en-OM", { minimumFractionDigits: 2 })} {CURRENCY.code}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {loadingInvoices && (
          <div className="bg-surface border border-border rounded-lg p-6 flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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
                name="final_inspection"
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-surface-elevated text-accent focus:ring-accent"
              />
              <span className="text-sm text-text-primary">
                {t("finalInspection")}
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                name="keys_returned"
                type="checkbox"
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
              name="deposit_status"
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
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? tc("loading") : t("confirmMoveOut")}
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
    </div>
  );
}
