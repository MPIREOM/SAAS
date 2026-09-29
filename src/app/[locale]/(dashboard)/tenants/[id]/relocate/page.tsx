"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRightLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Relocate a tenant from one unit to another in a single step.
 *
 * Closes the current lease, opens a fresh lease on the new unit, transfers
 * the security deposit and carries every open invoice over unchanged — all
 * inside the `relocate_tenant` RPC (migration 044), so nothing has to be
 * cancelled or re-issued by hand.
 */

interface ActiveLease {
  id: string;
  unitId: string;
  propertyName: string;
  ownerId: string | null;
  unitNumber: string;
  monthlyRent: number;
  securityDeposit: number | null;
  paymentDueDay: number;
  endDate: string;
}

interface VacantUnit {
  id: string;
  unitNumber: string;
  propertyName: string;
  ownerId: string | null;
  rentAmount: number;
}

interface OpenInvoice {
  id: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
  invoiceType: string | null;
}

interface LeaseRow {
  id: string;
  unit_id: string;
  end_date: string;
  monthly_rent: string | number | null;
  security_deposit: string | number | null;
  payment_due_day: number | null;
  units: {
    unit_number: string;
    properties: { name: string; owner_id: string | null };
  };
}

interface UnitRow {
  id: string;
  unit_number: string;
  rent_amount: string | number | null;
  properties: { name: string; owner_id: string | null };
}

const fmt = (n: number) => n.toLocaleString("en-OM", { minimumFractionDigits: 2 });

const todayIso = () => new Date().toISOString().split("T")[0];

/** One year minus one day after `start` (e.g. 2026-10-01 → 2027-09-30). */
const defaultEndFor = (start: string) => {
  if (!start) return "";
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
};

export default function RelocateTenantPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const tenantId = params.id as string;
  const requestedLease = searchParams.get("lease");
  const t = useTranslations("tenants.relocate");
  const tt = useTranslations("tenants");
  const tc = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [leases, setLeases] = useState<ActiveLease[]>([]);
  const [vacantUnits, setVacantUnits] = useState<VacantUnit[]>([]);
  const [selectedLeaseId, setSelectedLeaseId] = useState("");

  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  // Lease the `invoices` list was loaded for; differs from the selection
  // while the next list is loading.
  const [invoicesLeaseId, setInvoicesLeaseId] = useState("");

  const [newUnitId, setNewUnitId] = useState("");
  const [moveDate, setMoveDate] = useState(todayIso);
  // null = follow the default derived from the move / start date
  const [startDateInput, setStartDateInput] = useState<string | null>(null);
  const [endDateInput, setEndDateInput] = useState<string | null>(null);
  const [rentInput, setRentInput] = useState<string | null>(null);
  const [depositInput, setDepositInput] = useState<string | null>(null);
  const [dueDayInput, setDueDayInput] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const [tenantRes, leasesRes, unitsRes] = await Promise.all([
        supabase.from("tenants").select("full_name").eq("id", tenantId).single(),
        supabase
          .from("leases")
          .select(
            `id, unit_id, end_date, monthly_rent, security_deposit, payment_due_day,
             units!inner(unit_number, properties!inner(name, owner_id))`,
          )
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("start_date", { ascending: true }),
        supabase
          .from("units")
          .select("id, unit_number, rent_amount, properties!inner(name, owner_id)")
          .eq("status", "vacant")
          .order("unit_number", { ascending: true }),
      ]);
      if (cancelled) return;

      const firstError = tenantRes.error || leasesRes.error || unitsRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }

      const leaseList = ((leasesRes.data ?? []) as unknown as LeaseRow[]).map(
        (l): ActiveLease => ({
          id: l.id,
          unitId: l.unit_id,
          propertyName: l.units.properties.name,
          ownerId: l.units.properties.owner_id,
          unitNumber: l.units.unit_number,
          monthlyRent: Number(l.monthly_rent || 0),
          securityDeposit:
            l.security_deposit === null ? null : Number(l.security_deposit),
          paymentDueDay: l.payment_due_day || 1,
          endDate: l.end_date,
        }),
      );
      const unitList = ((unitsRes.data ?? []) as unknown as UnitRow[])
        .map(
          (u): VacantUnit => ({
            id: u.id,
            unitNumber: u.unit_number,
            propertyName: u.properties.name,
            ownerId: u.properties.owner_id,
            rentAmount: Number(u.rent_amount || 0),
          }),
        )
        .sort(
          (a, b) =>
            a.propertyName.localeCompare(b.propertyName) ||
            a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
        );

      setTenantName(tenantRes.data?.full_name ?? "");
      setLeases(leaseList);
      setVacantUnits(unitList);
      const preselected =
        leaseList.find((l) => l.id === requestedLease) ??
        (leaseList.length === 1 ? leaseList[0] : null);
      setSelectedLeaseId(preselected?.id ?? "");
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, requestedLease]);

  // Open invoices of the lease being left — these carry over to the new one.
  useEffect(() => {
    if (!selectedLeaseId) return;
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const { data, error: invError } = await supabase
        .from("invoices")
        .select("id, amount, paid_amount, due_date, status, invoice_type")
        .eq("lease_id", selectedLeaseId)
        .in("status", ["pending", "overdue", "partial"])
        .order("due_date", { ascending: true });
      if (cancelled) return;
      if (invError) {
        setError(invError.message);
        setInvoices([]);
      } else {
        setInvoices(
          (data ?? []).map((i) => ({
            id: i.id,
            amount: Number(i.amount || 0),
            paidAmount: Number(i.paid_amount || 0),
            dueDate: i.due_date,
            status: i.status,
            invoiceType: i.invoice_type ?? null,
          })),
        );
      }
      setInvoicesLeaseId(selectedLeaseId);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedLeaseId]);

  const loadingInvoices = invoicesLeaseId !== selectedLeaseId;
  const currentLease = leases.find((l) => l.id === selectedLeaseId) ?? null;
  const newUnit = vacantUnits.find((u) => u.id === newUnitId) ?? null;

  // Derived form values: follow the defaults until the user edits a field.
  const startDate = startDateInput ?? moveDate;
  const endDate = endDateInput ?? defaultEndFor(startDate);
  const monthlyRent =
    rentInput ?? (newUnit ? String(newUnit.rentAmount || currentLease?.monthlyRent || "") : "");
  const securityDeposit =
    depositInput ?? (currentLease?.securityDeposit != null ? String(currentLease.securityDeposit) : "");
  const paymentDueDay = dueDayInput ?? String(currentLease?.paymentDueDay ?? 1);

  const openInvoices = loadingInvoices ? [] : invoices;
  const carriedTotal = openInvoices.reduce((sum, i) => sum + (i.amount - i.paidAmount), 0);
  const ownerChanges =
    !!currentLease && !!newUnit && currentLease.ownerId !== newUnit.ownerId;

  const selectLease = (id: string) => {
    setSelectedLeaseId(id);
    setDepositInput(null);
    setDueDayInput(null);
  };

  const validate = (): string | null => {
    if (!currentLease) return t("errors.currentLeaseRequired");
    if (!newUnit) return t("errors.newUnitRequired");
    if (!moveDate || !startDate || !endDate) return tc("required");
    if (endDate <= startDate) return t("errors.endAfterStart");
    if (!(Number(monthlyRent) > 0)) return t("errors.rentPositive");
    if (securityDeposit && Number(securityDeposit) < 0) return t("errors.depositNegative");
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("relocate_tenant", {
      p_old_lease_id: currentLease!.id,
      p_new_unit_id: newUnit!.id,
      p_move_date: moveDate,
      p_start_date: startDate,
      p_end_date: endDate,
      p_monthly_rent: Number(monthlyRent),
      p_security_deposit: securityDeposit === "" ? null : Number(securityDeposit),
      p_payment_due_day: parseInt(paymentDueDay, 10) || 1,
      p_notes: notes.trim() || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    router.push(`/${locale}/tenants/${tenantId}`);
    router.refresh();
  };

  let body: React.ReactNode;
  if (loading) {
    body = <Spinner label={tc("loading")} sizeClassName="h-8 w-8" className="min-h-[200px]" />;
  } else if (loadError) {
    body = <Alert variant="destructive" title={t("loadError")}>{loadError}</Alert>;
  } else if (leases.length === 0) {
    body = <Alert variant="warning">{t("noActiveLease")}</Alert>;
  } else {
    body = (
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {error && <Alert variant="destructive">{error}</Alert>}

        {/* From → To */}
        <section className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <h2 className="text-base font-display font-semibold text-text-primary">
            {t("unitsTitle")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:items-start">
            <div className="space-y-2">
              {leases.length > 1 ? (
                <Select
                  label={t("fromLabel")}
                  placeholder={t("fromPlaceholder")}
                  value={selectedLeaseId}
                  onChange={(e) => selectLease(e.target.value)}
                >
                  {leases.map((l) => (
                    <option key={l.id} value={l.id}>
                      {t("unitOption", {
                        property: l.propertyName,
                        unit: l.unitNumber,
                        rent: fmt(l.monthlyRent),
                        currency: CURRENCY.code,
                      })}
                    </option>
                  ))}
                </Select>
              ) : (
                <div>
                  <p className="text-sm font-medium text-text-primary mb-1.5">{t("fromLabel")}</p>
                  <div className="rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5">
                    <p className="text-sm font-medium text-text-primary">
                      {leases[0].propertyName} · {tt("moveOutFees.preview.unitNumber")} {leases[0].unitNumber}
                    </p>
                    <p className="text-xs text-text-secondary font-mono ltr-nums mt-0.5">
                      {fmt(leases[0].monthlyRent)} {CURRENCY.code}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <ArrowRight
              aria-hidden="true"
              className="hidden md:block h-5 w-5 mt-9 text-accent rtl:rotate-180"
            />

            <Select
              label={t("toLabel")}
              placeholder={vacantUnits.length ? t("toPlaceholder") : t("noVacantUnits")}
              helperText={t("toHint")}
              value={newUnitId}
              onChange={(e) => {
                setNewUnitId(e.target.value);
                setRentInput(null);
              }}
              disabled={vacantUnits.length === 0}
            >
              {vacantUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {t("unitOption", {
                    property: u.propertyName,
                    unit: u.unitNumber,
                    rent: fmt(u.rentAmount),
                    currency: CURRENCY.code,
                  })}
                </option>
              ))}
            </Select>
          </div>
        </section>

        {/* New lease */}
        <section className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-display font-semibold text-text-primary">
              {t("leaseTitle")}
            </h2>
            <p className="text-sm text-text-secondary mt-1">{t("leaseDescription")}</p>
          </div>

          <Input
            type="date"
            label={`${t("moveDate")} *`}
            helperText={t("moveDateHint")}
            value={moveDate}
            onChange={(e) => setMoveDate(e.target.value)}
            className="ltr-nums"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="date"
              label={`${tt("startDate")} *`}
              value={startDate}
              onChange={(e) => setStartDateInput(e.target.value)}
              className="ltr-nums"
              required
            />
            <Input
              type="date"
              label={`${tt("endDate")} *`}
              value={endDate}
              onChange={(e) => setEndDateInput(e.target.value)}
              className="ltr-nums"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              type="number"
              step="0.001"
              min="0"
              label={`${t("monthlyRent")} (${CURRENCY.code}) *`}
              value={monthlyRent}
              onChange={(e) => setRentInput(e.target.value)}
              className="font-mono ltr-nums"
              required
            />
            <Input
              type="number"
              step="0.001"
              min="0"
              label={`${tt("securityDeposit")} (${CURRENCY.code})`}
              helperText={t("depositHint")}
              value={securityDeposit}
              onChange={(e) => setDepositInput(e.target.value)}
              className="font-mono ltr-nums"
            />
            <Select
              label={t("paymentDueDay")}
              value={paymentDueDay}
              onChange={(e) => setDueDayInput(e.target.value)}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            label={tt("notes")}
            placeholder={t("notesPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </section>

        {/* Invoices that carry over */}
        <section className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-display font-semibold text-text-primary">
              {t("invoicesTitle")}
            </h2>
            <p className="text-sm text-text-secondary mt-1">{t("invoicesDescription")}</p>
          </div>

          {!currentLease ? (
            <p className="text-sm text-text-secondary">{t("pickCurrentFirst")}</p>
          ) : loadingInvoices ? (
            <Spinner label={tc("loading")} className="min-h-[80px]" />
          ) : invoices.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("noOpenInvoices")}</p>
          ) : (
            <>
              <ul className="divide-y divide-border/40 rounded-lg border border-border/60">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-text-secondary">
                      {t("dueOn")}{" "}
                      <span className="font-mono ltr-nums text-text-primary">{inv.dueDate}</span>
                      <span className="mx-1">·</span>
                      {t(`invoiceStatus.${inv.status}`)}
                    </span>
                    <span className="font-mono ltr-nums text-end text-text-primary">
                      {fmt(inv.amount - inv.paidAmount)} {CURRENCY.code}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between text-sm font-medium">
                <span className="text-text-primary">{t("carriedTotal")}</span>
                <span className="font-mono ltr-nums text-end text-text-primary">
                  {fmt(carriedTotal)} {CURRENCY.code}
                </span>
              </div>
              {ownerChanges && <Alert variant="warning">{t("ownerChangeWarning")}</Alert>}
            </>
          )}
        </section>

        {/* Summary */}
        {currentLease && newUnit && (
          <Alert variant="info" title={t("summaryTitle")}>
            <ul className="list-disc ps-5 space-y-1 text-text-primary">
              <li>
                {t("summaryClose", {
                  unit: currentLease.unitNumber,
                  date: moveDate,
                })}
              </li>
              <li>
                {t("summaryOpen", {
                  unit: newUnit.unitNumber,
                  property: newUnit.propertyName,
                  rent: fmt(Number(monthlyRent) || 0),
                  currency: CURRENCY.code,
                })}
              </li>
              <li>
                {t("summaryInvoices", {
                  count: openInvoices.length,
                  total: fmt(carriedTotal),
                  currency: CURRENCY.code,
                })}
              </li>
              <li>{t("summaryDeposit")}</li>
              <li>{t("summaryNoFees")}</li>
            </ul>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={saving} disabled={!currentLease || !newUnit}>
            <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
            {t("submit")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary font-display flex items-center gap-2">
          <ArrowRightLeft aria-hidden="true" className="h-6 w-6 text-text-secondary" />
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {tenantName ? `${tenantName} · ` : ""}
          {t("description")}
        </p>
      </div>
      {body}
    </div>
  );
}
