"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, ArrowLeft, Calendar, DollarSign } from "lucide-react";
import { CURRENCY } from "@/lib/currency";

interface CurrentLease {
  id: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  security_deposit: string | null;
  payment_due_day: number;
  unit_id: string;
  tenant_id: string;
  units: {
    unit_number: string;
    properties: { name: string };
  };
}

export default function RenewLeasePage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const tenantId = params.id as string;
  const t = useTranslations("leases");
  const tc = useTranslations("common");
  const tt = useTranslations("tenants");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentLease, setCurrentLease] = useState<CurrentLease | null>(null);
  const [tenantName, setTenantName] = useState("");

  // Form fields
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [paymentDueDay, setPaymentDueDay] = useState("1");

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      // Fetch tenant name
      const { data: tenant } = await supabase
        .from("tenants")
        .select("full_name")
        .eq("id", tenantId)
        .single();
      if (tenant) setTenantName(tenant.full_name);

      // Fetch current active lease
      const { data: lease } = await supabase
        .from("leases")
        .select("*, units!inner(unit_number, properties!inner(name))")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("end_date", { ascending: false })
        .limit(1)
        .single();

      if (lease) {
        setCurrentLease(lease as unknown as CurrentLease);
        // Default new lease starts day after current ends
        const currentEnd = new Date(lease.end_date);
        const newStart = new Date(currentEnd);
        newStart.setDate(newStart.getDate() + 1);
        const newEnd = new Date(newStart);
        newEnd.setFullYear(newEnd.getFullYear() + 1);

        setStartDate(newStart.toISOString().split("T")[0]);
        setEndDate(newEnd.toISOString().split("T")[0]);
        setMonthlyRent(lease.monthly_rent?.toString() || "");
        setSecurityDeposit(lease.security_deposit?.toString() || "");
        setPaymentDueDay(lease.payment_due_day?.toString() || "1");
      }
      setLoading(false);
    }
    fetchData();
  }, [tenantId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentLease || !startDate || !endDate || !monthlyRent) {
      setError(tc("required"));
      return;
    }
    if (endDate <= startDate) {
      setError(t("endDateAfterStart"));
      return;
    }
    if (Number(monthlyRent) <= 0) {
      setError(t("rentMustBePositive"));
      return;
    }

    setSaving(true);
    setError("");
    const supabase = createClient();

    // Deactivate old lease
    const { error: deactivateError } = await supabase
      .from("leases")
      .update({ is_active: false })
      .eq("id", currentLease.id);

    if (deactivateError) {
      setError(deactivateError.message);
      setSaving(false);
      return;
    }

    // Create new lease
    const { data: { user } } = await supabase.auth.getUser();
    const newLease: Record<string, unknown> = {
      tenant_id: tenantId,
      unit_id: currentLease.unit_id,
      start_date: startDate,
      end_date: endDate,
      monthly_rent: parseFloat(monthlyRent),
      payment_due_day: parseInt(paymentDueDay),
      is_active: true,
      created_by: user?.id,
    };
    if (securityDeposit) {
      newLease.security_deposit = parseFloat(securityDeposit);
    }

    const { error: createError } = await supabase
      .from("leases")
      .insert(newLease);

    if (createError) {
      // Rollback: reactivate old lease
      await supabase.from("leases").update({ is_active: true }).eq("id", currentLease.id);
      setError(createError.message);
      setSaving(false);
      return;
    }

    router.push(`/${locale}/tenants/${tenantId}`);
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentLease) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <p className="text-text-secondary">{t("noLeases")}</p>
          <button onClick={() => router.back()} className="mt-4 text-sm text-accent hover:text-accent-hover">
            {tc("back")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">{t("renewLease")}</h1>
          <p className="text-sm text-text-secondary">{tenantName}</p>
        </div>
      </div>

      {/* Current Lease Summary */}
      <div className="bg-surface-elevated/50 border border-border/50 rounded-xl p-4">
        <h3 className="text-xs uppercase tracking-widest text-text-secondary font-semibold mb-3">Current Lease</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-xs text-text-secondary">Unit</span>
            <p className="font-medium text-text-primary">
              {(currentLease.units as unknown as { unit_number: string; properties: { name: string } }).unit_number} - {(currentLease.units as unknown as { unit_number: string; properties: { name: string } }).properties.name}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-secondary">{t("startDate")}</span>
            <p className="font-mono text-text-primary">{currentLease.start_date}</p>
          </div>
          <div>
            <span className="text-xs text-text-secondary">{t("endDate")}</span>
            <p className="font-mono text-text-primary">{currentLease.end_date}</p>
          </div>
          <div>
            <span className="text-xs text-text-secondary">{t("monthlyRent")}</span>
            <p className="font-mono font-medium text-text-primary">{currentLease.monthly_rent} {CURRENCY.code}</p>
          </div>
        </div>
      </div>

      {/* Renewal Form */}
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <RefreshCw className="h-4 w-4 text-accent" />
          <h2 className="text-base font-display font-semibold text-text-primary">New Lease Terms</h2>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">{t("startDate")} *</label>
            <div className="relative">
              <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">{t("endDate")} *</label>
            <div className="relative">
              <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                required
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">{t("monthlyRent")} ({CURRENCY.code}) *</label>
            <div className="relative">
              <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                type="number"
                step="0.01"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">{t("securityDeposit")} ({CURRENCY.code})</label>
            <div className="relative">
              <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                type="number"
                step="0.01"
                value={securityDeposit}
                onChange={(e) => setSecurityDeposit(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        <div className="max-w-[200px]">
          <label className="block text-sm font-medium text-text-primary mb-1.5">{t("paymentDueDay")}</label>
          <select
            value={paymentDueDay}
            onChange={(e) => setPaymentDueDay(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-6 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${saving ? "animate-spin" : ""}`} />
            {saving ? tc("loading") : t("renewLease")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-10 px-6 bg-surface-elevated border border-border text-text-secondary text-sm font-medium rounded-lg hover:text-text-primary transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
