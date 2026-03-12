"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut, X } from "lucide-react";

interface MoveOutDialogProps {
  unitId: string;
  leaseId: string;
  tenantName: string;
  leaseStartDate: string;
}

export default function MoveOutDialog({
  unitId,
  leaseId,
  tenantName,
  leaseStartDate,
}: MoveOutDialogProps) {
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [moveOutDate, setMoveOutDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const handleConfirm = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/units/${unitId}/move-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move_out_date: moveOutDate, lease_id: leaseId }),
      });

      if (!res.ok) {
        let message = tc("error");
        try {
          const data = await res.json();
          message = data.error || `HTTP ${res.status}`;
        } catch {
          message = `HTTP ${res.status}: ${res.statusText}`;
        }
        setError(message);
        setLoading(false);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-medium rounded-md transition-colors border border-destructive/20"
      >
        <LogOut className="h-4 w-4" />
        {t("confirmMoveOut")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">
                {t("confirmMoveOut")}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-text-secondary">
                {t("moveOutDescription")}
              </p>

              <div className="bg-surface-elevated border border-border rounded-lg px-4 py-3">
                <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  {t("title")}
                </p>
                <p className="text-sm font-medium text-text-primary">
                  {tenantName}
                </p>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t("moveOut")} <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={moveOutDate}
                  min={new Date(leaseStartDate).toISOString().split("T")[0]}
                  onChange={(e) => setMoveOutDate(e.target.value)}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors disabled:opacity-50"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || !moveOutDate}
                className="h-9 px-4 bg-destructive hover:bg-destructive/90 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {loading ? tc("loading") : tc("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
