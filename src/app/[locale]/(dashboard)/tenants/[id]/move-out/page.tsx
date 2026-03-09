"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, LogOut } from "lucide-react";
import Link from "next/link";

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();
    const { locale, id } = await params;

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
      const { error: leaseError } = await supabase
        .from("leases")
        .update({
          is_active: false,
          vacate_date: formData.get("vacate_date") as string,
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
    }

    router.push(`/${locale}/tenants`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
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
