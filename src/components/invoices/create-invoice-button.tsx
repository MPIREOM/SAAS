"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Loader2 } from "lucide-react";
import { CURRENCY } from "@/lib/currency";

// An occupied unit: the "pickable" row in the property → unit selector.
// Every row has exactly one active lease (filtered at query time), so the
// tenant, rent and due-day are unambiguous once a unit is chosen.
interface UnitWithLease {
  unit_id: string;
  unit_number: string;
  property_id: string;
  property_name: string;
  lease_id: string;
  tenant_id: string;
  tenant_name: string;
  monthly_rent: number;
  payment_due_day: number;
}

export function CreateInvoiceButton() {
  const t = useTranslations("invoices");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Occupied-unit catalogue, loaded once per dialog open.
  const [units, setUnits] = useState<UnitWithLease[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");

  // Invoice fields
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");

  // Load all occupied units (one active lease per unit) when the dialog
  // opens. Preloading the full list avoids round-trips between dropdown
  // changes — the dataset is small for a typical property manager.
  useEffect(() => {
    if (!open || units.length > 0) return;
    let cancelled = false;
    setLoadingUnits(true);
    (async () => {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("leases")
        .select(`
          id, tenant_id, unit_id, monthly_rent, payment_due_day, is_active,
          tenants(full_name),
          units(unit_number, property_id, properties:property_id(id, name))
        `)
        .eq("is_active", true);

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoadingUnits(false);
        return;
      }

      const rows: UnitWithLease[] = (data || [])
        .map((l) => {
          const tenant = l.tenants as unknown as { full_name?: string } | null;
          const unit = l.units as unknown as {
            unit_number?: string;
            property_id?: string;
            properties?: { id?: string; name?: string };
          } | null;
          return {
            unit_id: l.unit_id as string,
            unit_number: unit?.unit_number || "",
            property_id: unit?.properties?.id || (unit?.property_id as string) || "",
            property_name: unit?.properties?.name || "",
            lease_id: l.id as string,
            tenant_id: l.tenant_id as string,
            tenant_name: tenant?.full_name || "Unknown",
            monthly_rent: Number(l.monthly_rent) || 0,
            payment_due_day: Number(l.payment_due_day) || 1,
          };
        })
        .filter((r) => r.property_id && r.unit_id);
      setUnits(rows);
      setLoadingUnits(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, units.length]);

  // Derive the property dropdown list from the loaded units — each property
  // appears once, only if it has at least one occupied unit to invoice.
  const properties = useMemo(() => {
    const map = new Map<string, string>();
    units.forEach((u) => map.set(u.property_id, u.property_name));
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [units]);

  // Units for the currently-selected property, sorted by unit number with
  // numeric awareness so "2" < "10".
  const unitsForProperty = useMemo(() => {
    if (!selectedPropertyId) return [];
    return units
      .filter((u) => u.property_id === selectedPropertyId)
      .sort((a, b) =>
        a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
      );
  }, [units, selectedPropertyId]);

  const selectedUnit = useMemo(
    () => units.find((u) => u.unit_id === selectedUnitId) || null,
    [units, selectedUnitId]
  );

  // Auto-fill amount and default the due date to the 1st of the current
  // month when a unit is picked. The lease's payment_due_day is ignored
  // here on purpose: the admin always wants the standard "rent-due on
  // the 1st" calendar, and can type a different date if a specific
  // lease needs one.
  useEffect(() => {
    if (!selectedUnit) return;
    setAmount(String(selectedUnit.monthly_rent));

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    setDueDate(`${y}-${String(m + 1).padStart(2, "0")}-01`);
  }, [selectedUnit]);

  // Derive the billing period from the due date: period runs from the
  // due date to exactly one month later. Keeping this in its own effect
  // means typing a different due date also shifts the period, so the
  // admin only ever has to touch one field.
  useEffect(() => {
    if (!dueDate) return;
    setPeriodStart(dueDate);
    const d = new Date(`${dueDate}T00:00:00`);
    d.setMonth(d.getMonth() + 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    setPeriodEnd(
      `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }, [dueDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("invoices").insert({
      lease_id: selectedUnit.lease_id,
      tenant_id: selectedUnit.tenant_id,
      unit_id: selectedUnit.unit_id,
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

    setSuccess(`Invoice created for ${selectedUnit.tenant_name}`);
    setLoading(false);

    setTimeout(() => {
      setOpen(false);
      resetForm();
      router.refresh();
    }, 1000);
  };

  const resetForm = () => {
    setSelectedPropertyId("");
    setSelectedUnitId("");
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
              {/* Property picker */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  Property <span className="text-destructive">*</span>
                </label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => {
                    setSelectedPropertyId(e.target.value);
                    setSelectedUnitId("");
                  }}
                  disabled={loadingUnits}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                >
                  <option value="">
                    {loadingUnits ? "Loading..." : "Select a property"}
                  </option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {!loadingUnits && properties.length === 0 && (
                  <p className="text-xs text-text-secondary mt-1">
                    No occupied units found.
                  </p>
                )}
              </div>

              {/* Unit picker — only shown after a property is chosen */}
              {selectedPropertyId && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    Unit <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                  >
                    <option value="">Select a unit</option>
                    {unitsForProperty.map((u) => (
                      <option key={u.unit_id} value={u.unit_id}>
                        {u.unit_number} — {u.tenant_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedUnit && (
                <>
                  {/* Resolved tenant summary */}
                  <div className="bg-surface-elevated border border-border rounded-md px-4 py-3">
                    <p className="text-xs text-text-secondary">Tenant</p>
                    <p className="text-sm font-medium text-text-primary mt-0.5">
                      {selectedUnit.tenant_name}
                    </p>
                    <p className="text-xs text-text-secondary mt-1">
                      {selectedUnit.property_name} / {selectedUnit.unit_number}
                      {" — "}
                      {selectedUnit.monthly_rent} {CURRENCY.code}/mo
                    </p>
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

              {selectedUnit && (
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
