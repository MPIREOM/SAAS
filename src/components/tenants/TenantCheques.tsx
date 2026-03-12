"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { FileCheck, Plus, X, AlertCircle, CheckCircle, XCircle, Ban } from "lucide-react";

interface Cheque {
  id: string;
  cheque_number: string;
  bank_name: string;
  cheque_date: string;
  amount: number;
  status: "pending" | "cleared" | "bounced" | "cancelled";
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-warning/10 text-warning border-warning/20",
  cleared:   "bg-success/10 text-success border-success/20",
  bounced:   "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-text-secondary/10 text-text-secondary border-border",
};

export default function TenantCheques({ tenantId }: { tenantId: string }) {
  const t = useTranslations("cheques");
  const tc = useTranslations("common");

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    cheque_number: "",
    bank_name: "",
    cheque_date: "",
    amount: "",
    notes: "",
  });

  const fetchCheques = async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/cheques`);
    const data = await res.json();
    setCheques(data.cheques || []);
    setLoading(false);
  };

  useEffect(() => { fetchCheques(); }, [tenantId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError("");

    const res = await fetch(`/api/tenants/${tenantId}/cheques`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
    });

    if (!res.ok) {
      const data = await res.json();
      setAddError(data.error || tc("error"));
      setAdding(false);
      return;
    }

    setShowAdd(false);
    setForm({ cheque_number: "", bank_name: "", cheque_date: "", amount: "", notes: "" });
    await fetchCheques();
    setAdding(false);
  };

  const updateStatus = async (chequeId: string, status: string) => {
    setUpdatingId(chequeId);
    await fetch(`/api/tenants/${tenantId}/cheques/${chequeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setCheques((prev) => prev.map((c) => c.id === chequeId ? { ...c, status: status as Cheque["status"] } : c));
    setUpdatingId(null);
  };

  const today = new Date();
  const daysUntil = (dateStr: string) =>
    Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-text-secondary" />
          {t("title")}
        </h2>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("addCheque")}
        </button>
      </div>

      {loading ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : cheques.length > 0 ? (
        <div className="space-y-2">
          {cheques.map((cheque) => {
            const days = daysUntil(cheque.cheque_date);
            const isDueSoon = cheque.status === "pending" && days >= 0 && days <= 7;
            const isOverdue = cheque.status === "pending" && days < 0;

            return (
              <div
                key={cheque.id}
                className="bg-surface border border-border rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: cheque info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary font-mono">
                        #{cheque.cheque_number}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[cheque.status]}`}>
                        {t(`statuses.${cheque.status}`)}
                      </span>
                      {isDueSoon && (
                        <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {t("dueSoon")}
                        </span>
                      )}
                      {isOverdue && (
                        <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {t("overdue")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 flex-wrap">
                      <span className="text-xs text-text-secondary">{cheque.bank_name}</span>
                      <span className="text-xs text-text-secondary font-mono ltr-nums">{cheque.cheque_date}</span>
                      <span className="text-sm font-medium text-text-primary font-mono ltr-nums">
                        {cheque.amount} OMR
                      </span>
                    </div>
                    {cheque.notes && (
                      <p className="mt-1 text-xs text-text-secondary">{cheque.notes}</p>
                    )}
                  </div>

                  {/* Right: status actions (only for pending) */}
                  {cheque.status === "pending" && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => updateStatus(cheque.id, "cleared")}
                        disabled={updatingId === cheque.id}
                        title="Mark Cleared"
                        className="p-1.5 text-text-secondary hover:text-success transition-colors disabled:opacity-40"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => updateStatus(cheque.id, "bounced")}
                        disabled={updatingId === cheque.id}
                        title="Mark Bounced"
                        className="p-1.5 text-text-secondary hover:text-destructive transition-colors disabled:opacity-40"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => updateStatus(cheque.id, "cancelled")}
                        disabled={updatingId === cheque.id}
                        title="Cancel"
                        className="p-1.5 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <FileCheck className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
          <p className="text-sm text-text-secondary mb-3">{t("noCheques")}</p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("addCheque")}
          </button>
        </div>
      )}

      {/* Add Cheque Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">{t("addCheque")}</h2>
              <button onClick={() => { setShowAdd(false); setAddError(""); }} className="text-text-secondary hover:text-text-primary transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    {t("chequeNumber")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.cheque_number}
                    onChange={(e) => setForm((f) => ({ ...f, cheque_number: e.target.value }))}
                    placeholder="100201"
                    className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    {t("amount")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="250"
                    className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t("bankName")} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.bank_name}
                  onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                  placeholder="Bank Muscat"
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t("chequeDate")} <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.cheque_date}
                  onChange={(e) => setForm((f) => ({ ...f, cheque_date: e.target.value }))}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {tc("notes")} <span className="text-text-secondary text-xs">({tc("optional")})</span>
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. April rent - Unit 102"
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {addError && <p className="text-sm text-destructive">{addError}</p>}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setAddError(""); }}
                  disabled={adding}
                  className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors disabled:opacity-50"
                >
                  {tc("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {adding ? tc("loading") : t("addCheque")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
