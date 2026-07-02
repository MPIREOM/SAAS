"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";

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
  const tc = useTranslations("common");
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
  // loadingUnits is switched on in the open-button handler so the effect
  // never calls setState synchronously.
  useEffect(() => {
    if (!open || units.length > 0) return;
    let cancelled = false;
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

  // Derive the billing period from the due date: period runs from the
  // due date to exactly one month later, so the admin only ever has to
  // touch one field. Called wherever the due date changes.
  const applyDueDate = (value: string) => {
    setDueDate(value);
    if (!value) return;
    setPeriodStart(value);
    const d = new Date(`${value}T00:00:00`);
    d.setMonth(d.getMonth() + 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    setPeriodEnd(
      `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  };

  // Auto-fill amount and default the due date to the 1st of the current
  // month when a unit is picked. The lease's payment_due_day is ignored
  // here on purpose: the admin always wants the standard "rent-due on
  // the 1st" calendar, and can type a different date if a specific
  // lease needs one.
  const handleUnitChange = (unitId: string) => {
    setSelectedUnitId(unitId);
    const unit = units.find((u) => u.unit_id === unitId);
    if (!unit) return;
    setAmount(String(unit.monthly_rent));

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    applyDueDate(`${y}-${String(m + 1).padStart(2, "0")}-01`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // The DB enforces a unique (lease_id, period_start) constraint, so the
    // bare insert error ("duplicate key value violates unique constraint
    // invoices_lease_period_unique") is what an admin sees when an invoice
    // for that period already exists — typically auto-generated by the
    // daily cron, and possibly already paid or cancelled (and therefore
    // hidden from the outstanding-invoices view). Pre-check so we can show
    // the existing invoice's status instead of a raw Postgres error.
    if (periodStart) {
      const { data: existing } = await supabase
        .from("invoices")
        .select("id, status")
        .eq("lease_id", selectedUnit.lease_id)
        .eq("period_start", periodStart)
        .maybeSingle();

      if (existing) {
        setError(
          t("invoicePeriodExistsWithStatus", { status: existing.status })
        );
        setLoading(false);
        return;
      }
    }

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
      const msg = insertError.message?.includes("invoices_lease_period_unique")
        ? t("invoicePeriodExists")
        : insertError.message;
      setError(msg);
      setLoading(false);
      return;
    }

    setSuccess(t("invoiceCreatedFor", { name: selectedUnit.tenant_name }));
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
      <Button
        onClick={() => {
          if (units.length === 0) setLoadingUnits(true);
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t("createInvoice")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent maxWidth="max-w-lg" className="flex max-h-[90vh] flex-col">
          <DialogHeader>
            <DialogTitle>{t("createInvoice")}</DialogTitle>
          </DialogHeader>

          <DialogBody className="overflow-y-auto">
            <form
              id="create-invoice-form"
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* Property picker */}
              <Select
                label={`${t("property")} *`}
                value={selectedPropertyId}
                onChange={(e) => {
                  setSelectedPropertyId(e.target.value);
                  setSelectedUnitId("");
                }}
                disabled={loadingUnits}
                helperText={
                  !loadingUnits && properties.length === 0
                    ? t("noOccupiedUnits")
                    : undefined
                }
              >
                <option value="">
                  {loadingUnits ? tc("loading") : t("selectProperty")}
                </option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>

              {/* Unit picker — only shown after a property is chosen */}
              {selectedPropertyId && (
                <div className="animate-fade-in-up">
                  <Select
                    label={`${t("unit")} *`}
                    value={selectedUnitId}
                    onChange={(e) => handleUnitChange(e.target.value)}
                  >
                    <option value="">{t("selectUnit")}</option>
                    {unitsForProperty.map((u) => (
                      <option key={u.unit_id} value={u.unit_id}>
                        {u.unit_number} — {u.tenant_name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {selectedUnit && (
                <>
                  {/* Resolved tenant summary */}
                  <div className="rounded-xl border border-border/40 bg-surface-elevated/50 px-4 py-3 animate-fade-in-up">
                    <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                      {t("tenant")}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-text-primary">
                      {selectedUnit.tenant_name}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {selectedUnit.property_name} / {selectedUnit.unit_number}
                      {" — "}
                      <span className="font-mono ltr-nums">
                        {selectedUnit.monthly_rent} {CURRENCY.code}/mo
                      </span>
                    </p>
                  </div>

                  {/* Amount */}
                  <Input
                    type="number"
                    step="0.01"
                    required
                    label={`${t("amount")} (${CURRENCY.code}) *`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="font-mono ltr-nums"
                  />

                  {/* Due Date */}
                  <Input
                    type="date"
                    required
                    label={`${t("dueDate")} *`}
                    value={dueDate}
                    onChange={(e) => applyDueDate(e.target.value)}
                    className="font-mono ltr-nums"
                  />

                  {/* Billing Period */}
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="date"
                      label={t("periodStart")}
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="font-mono ltr-nums"
                    />
                    <Input
                      type="date"
                      label={t("periodEnd")}
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="font-mono ltr-nums"
                    />
                  </div>

                  {/* Notes */}
                  <Textarea
                    label={t("notes")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder={t("optionalNotes")}
                    className="min-h-0 resize-none"
                  />
                </>
              )}

              {error && (
                <Alert variant="destructive" className="animate-fade-in-up">
                  {error}
                </Alert>
              )}
              {success && (
                <Alert variant="success" className="animate-fade-in-up">
                  {success}
                </Alert>
              )}
            </form>
          </DialogBody>

          {selectedUnit && (
            <DialogFooter className="pt-4 border-t border-border/40">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                {tc("cancel")}
              </Button>
              <Button
                type="submit"
                form="create-invoice-form"
                loading={loading}
                disabled={!amount || !dueDate}
              >
                {t("createInvoice")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
