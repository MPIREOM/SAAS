"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Loader2, Search } from "lucide-react";
import { CURRENCY } from "@/lib/currency";

interface TenantOption {
  id: string;
  full_name: string;
  leases: {
    id: string;
    unit_id: string;
    monthly_rent: number;
    payment_due_day: number;
    unit_number: string;
    property_name: string;
  }[];
}

export function CreateInvoiceButton() {
  const t = useTranslations("invoices");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Tenant search
  const [search, setSearch] = useState("");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantOption | null>(null);
  const [selectedLeaseIdx, setSelectedLeaseIdx] = useState(0);

  // Invoice fields
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");

  // Search tenants
  useEffect(() => {
    if (!search || search.length < 2) {
      setTenants([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("tenants")
        .select(`
          id, full_name,
          leases(id, unit_id, monthly_rent, payment_due_day, is_active,
            units(unit_number, properties:property_id(name))
          )
        `)
        .eq("status", "active")
        .ilike("full_name", `%${search}%`)
        .limit(10);

      if (data) {
        setTenants(
          data
            .filter((t) => {
              const leases = t.leases as unknown as Array<Record<string, unknown>>;
              return leases?.some((l) => l.is_active);
            })
            .map((t) => {
              const leases = t.leases as unknown as Array<Record<string, unknown>>;
              return {
                id: t.id,
                full_name: t.full_name,
                leases: leases
                  .filter((l) => l.is_active)
                  .map((l) => {
                    const unit = l.units as Record<string, unknown>;
                    const prop = unit?.properties as Record<string, unknown>;
                    return {
                      id: l.id as string,
                      unit_id: l.unit_id as string,
                      monthly_rent: l.monthly_rent as number,
                      payment_due_day: l.payment_due_day as number,
                      unit_number: (unit?.unit_number as string) || "",
                      property_name: (prop?.name as string) || "",
                    };
                  }),
              };
            })
        );
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Auto-fill when tenant/lease selected
  useEffect(() => {
    if (selectedTenant && selectedTenant.leases[selectedLeaseIdx]) {
      const lease = selectedTenant.leases[selectedLeaseIdx];
      setAmount(String(lease.monthly_rent));

      // Default to current month
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const dueDay = Math.min(lease.payment_due_day || 1, new Date(y, m + 1, 0).getDate());
      setDueDate(`${y}-${String(m + 1).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`);
      setPeriodStart(`${y}-${String(m + 1).padStart(2, "0")}-01`);
      const lastDay = new Date(y, m + 1, 0).getDate();
      setPeriodEnd(`${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
    }
  }, [selectedTenant, selectedLeaseIdx]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant || !selectedTenant.leases[selectedLeaseIdx]) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const lease = selectedTenant.leases[selectedLeaseIdx];
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("invoices").insert({
      lease_id: lease.id,
      tenant_id: selectedTenant.id,
      unit_id: lease.unit_id,
      amount: Number(amount),
      due_date: dueDate,
      issued_date: new Date().toISOString().split("T")[0],
      period_start: periodStart || null,
      period_end: periodEnd || null,
      status: "pending",
      notes: notes || null,
      created_by: user?.id || null,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setSuccess(`Invoice created for ${selectedTenant.full_name}`);
    setLoading(false);

    setTimeout(() => {
      setOpen(false);
      resetForm();
      router.refresh();
    }, 1000);
  };

  const resetForm = () => {
    setSearch("");
    setTenants([]);
    setSelectedTenant(null);
    setSelectedLeaseIdx(0);
    setAmount("");
    setDueDate("");
    setPeriodStart("");
    setPeriodEnd("");
    setNotes("");
    setError("");
    setSuccess("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-lg transition-colors"
      >
        <Plus className="h-4 w-4" />
        {t("createInvoice")}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setOpen(false); resetForm(); }}
          />
          <div className="relative bg-surface border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-base font-semibold text-text-primary font-display">
                {t("createInvoice")}
              </h2>
              <button
                onClick={() => { setOpen(false); resetForm(); }}
                className="p-1 rounded-md hover:bg-surface-elevated text-text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Tenant Search */}
              {!selectedTenant ? (
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    {t("tenant")} <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search tenant name..."
                      autoFocus
                      className="w-full h-10 bg-surface-elevated border border-border rounded-md pl-9 pr-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary animate-spin" />
                    )}
                  </div>
                  {tenants.length > 0 && (
                    <div className="mt-2 border border-border rounded-md overflow-hidden">
                      {tenants.map((tenant) => (
                        <button
                          key={tenant.id}
                          type="button"
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setSelectedLeaseIdx(0);
                            setSearch("");
                            setTenants([]);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-surface-elevated text-sm border-b border-border last:border-b-0 transition-colors"
                        >
                          <span className="font-medium text-text-primary">
                            {tenant.full_name}
                          </span>
                          <span className="text-xs text-text-secondary ml-2">
                            {tenant.leases.map((l) => `${l.property_name} / ${l.unit_number}`).join(", ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Selected Tenant */}
                  <div className="flex items-center justify-between bg-surface-elevated border border-border rounded-md px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {selectedTenant.full_name}
                      </p>
                      {selectedTenant.leases.length > 1 ? (
                        <select
                          value={selectedLeaseIdx}
                          onChange={(e) => setSelectedLeaseIdx(Number(e.target.value))}
                          className="mt-1 text-xs bg-transparent text-text-secondary focus:outline-none"
                        >
                          {selectedTenant.leases.map((l, i) => (
                            <option key={l.id} value={i}>
                              {l.property_name} / {l.unit_number} — {l.monthly_rent} {CURRENCY.code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs text-text-secondary mt-0.5">
                          {selectedTenant.leases[0]?.property_name} / {selectedTenant.leases[0]?.unit_number}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedTenant(null); setSelectedLeaseIdx(0); }}
                      className="text-xs text-accent hover:underline"
                    >
                      Change
                    </button>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("amount")} ({CURRENCY.code}) <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>

                  {/* Due Date */}
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("dueDate")} <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>

                  {/* Billing Period */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-text-secondary mb-1.5">
                        {t("periodStart")}
                      </label>
                      <input
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-text-secondary mb-1.5">
                        {t("periodEnd")}
                      </label>
                      <input
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">
                      {t("notes")}
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional notes..."
                      className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              {success && (
                <p className="text-sm text-success">{success}</p>
              )}

              {selectedTenant && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading || !amount || !dueDate}
                    className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t("createInvoice")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); resetForm(); }}
                    className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
