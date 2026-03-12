"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface LeaseOption {
  id: string;
  tenant_name: string;
  unit_number: string;
  property_name: string;
  monthly_rent: string;
  tenant_id: string;
}

interface ChequeOption {
  id: string;
  cheque_number: string;
  bank_name: string;
  cheque_date: string;
  amount: string;
  status: string;
}

export default function NewPaymentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = useTranslations("payments");
  const tch = useTranslations("cheques");
  const tc = useTranslations("common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leases, setLeases] = useState<LeaseOption[]>([]);
  const [selectedLease, setSelectedLease] = useState<LeaseOption | null>(null);
  const [method, setMethod] = useState("cash");
  const [cheques, setCheques] = useState<ChequeOption[]>([]);
  const [selectedCheque, setSelectedCheque] = useState<ChequeOption | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [referenceNumber, setReferenceNumber] = useState("");

  useEffect(() => {
    const loadLeases = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("leases")
        .select(`
          id,
          monthly_rent,
          tenant_id,
          tenants(full_name),
          units(unit_number, properties(name))
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (data) {
        setLeases(
          data.map((lease: Record<string, unknown>) => {
            const tenant = lease.tenants as Record<string, unknown> | null;
            const unit = lease.units as Record<string, unknown> | null;
            const property = unit?.properties as Record<string, unknown> | null;
            return {
              id: lease.id as string,
              tenant_name: (tenant?.full_name as string) || "—",
              unit_number: (unit?.unit_number as string) || "—",
              property_name: (property?.name as string) || "—",
              monthly_rent: lease.monthly_rent as string,
              tenant_id: lease.tenant_id as string,
            };
          })
        );
      }
    };
    loadLeases();
  }, []);

  // Fetch cheques when tenant changes
  useEffect(() => {
    if (!selectedLease) {
      setCheques([]);
      setSelectedCheque(null);
      return;
    }

    const loadCheques = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("cheques")
        .select("*")
        .eq("tenant_id", selectedLease.tenant_id)
        .eq("status", "pending")
        .order("cheque_date", { ascending: true });

      if (data) {
        setCheques(
          data.map((c: Record<string, unknown>) => ({
            id: c.id as string,
            cheque_number: c.cheque_number as string,
            bank_name: c.bank_name as string,
            cheque_date: c.cheque_date as string,
            amount: c.amount as string,
            status: c.status as string,
          }))
        );
      } else {
        setCheques([]);
      }
    };
    loadCheques();
  }, [selectedLease]);

  const handleLeaseChange = (leaseId: string) => {
    const lease = leases.find((l) => l.id === leaseId) || null;
    setSelectedLease(lease);
    setSelectedCheque(null);
    setAmount(lease?.monthly_rent || "");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setReferenceNumber("");
  };

  const handleChequeChange = (chequeId: string) => {
    const cheque = cheques.find((c) => c.id === chequeId) || null;
    setSelectedCheque(cheque);
    if (cheque) {
      setAmount(cheque.amount);
      setPaymentDate(cheque.cheque_date);
      setReferenceNumber(`CHQ-${cheque.cheque_number}`);
    } else {
      setAmount(selectedLease?.monthly_rent || "");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setReferenceNumber("");
    }
  };

  const handleMethodChange = (newMethod: string) => {
    setMethod(newMethod);
    if (newMethod !== "cheque") {
      setSelectedCheque(null);
      setAmount(selectedLease?.monthly_rent || "");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setReferenceNumber("");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLease) return;

    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: payment, error: insertError } = await supabase
      .from("payments")
      .insert({
        lease_id: selectedLease.id,
        tenant_id: selectedLease.tenant_id,
        amount: formData.get("amount") as string,
        payment_date: formData.get("payment_date") as string,
        method: formData.get("method") as string,
        reference_number: (formData.get("reference_number") as string) || null,
        notes: (formData.get("notes") as string) || null,
        created_by: user?.id,
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // If cheque was selected, link it to this payment and mark as cleared
    if (selectedCheque && payment) {
      await supabase
        .from("cheques")
        .update({ payment_id: payment.id, status: "cleared" })
        .eq("id", selectedCheque.id);
    }

    const { locale } = await params;
    router.push(`/${locale}/payments`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          {t("logPayment")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          {/* Lease Selection */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("tenant")} / {t("unit")}{" "}
              <span className="text-destructive">*</span>
            </label>
            <select
              required
              onChange={(e) => handleLeaseChange(e.target.value)}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="">--</option>
              {leases.map((lease) => (
                <option key={lease.id} value={lease.id}>
                  {lease.tenant_name} — {lease.property_name} /{" "}
                  {lease.unit_number}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("method")} <span className="text-destructive">*</span>
            </label>
            <select
              name="method"
              required
              value={method}
              onChange={(e) => handleMethodChange(e.target.value)}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="cash">{t("methods.cash")}</option>
              <option value="bank_transfer">{t("methods.bankTransfer")}</option>
              <option value="cheque">{t("methods.cheque")}</option>
            </select>
          </div>

          {/* Cheque Selection - shown when method is cheque and tenant is selected */}
          {method === "cheque" && selectedLease && (
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {tch("title")}{" "}
                <span className="text-destructive">*</span>
              </label>
              {cheques.length > 0 ? (
                <select
                  required
                  onChange={(e) => handleChequeChange(e.target.value)}
                  value={selectedCheque?.id || ""}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="">--</option>
                  {cheques.map((cheque) => (
                    <option key={cheque.id} value={cheque.id}>
                      #{cheque.cheque_number} — {cheque.bank_name} —{" "}
                      {cheque.amount} OMR — {cheque.cheque_date}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-surface-elevated border border-border rounded-md p-3">
                  <p className="text-sm text-text-secondary">
                    No pending cheques found for this tenant
                  </p>
                </div>
              )}

              {selectedCheque && (
                <div className="mt-3 bg-surface-elevated border border-border rounded-md p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tch("chequeNumber")}
                      </span>
                      <p className="text-sm text-text-primary mt-0.5 font-mono">
                        {selectedCheque.cheque_number}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tch("bankName")}
                      </span>
                      <p className="text-sm text-text-primary mt-0.5">
                        {selectedCheque.bank_name}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tch("amount")}
                      </span>
                      <p className="text-sm text-text-primary mt-0.5 font-mono ltr-nums">
                        {selectedCheque.amount} OMR
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tch("chequeDate")}
                      </span>
                      <p className="text-sm text-text-primary mt-0.5 font-mono ltr-nums">
                        {selectedCheque.cheque_date}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("amount")} (OMR){" "}
                <span className="text-destructive">*</span>
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("paymentDate")}{" "}
                <span className="text-destructive">*</span>
              </label>
              <input
                name="payment_date"
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("referenceNumber")}
            </label>
            <input
              name="reference_number"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. TXN-12345"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder="Optional notes..."
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={
              loading ||
              !selectedLease ||
              (method === "cheque" && !selectedCheque && cheques.length > 0)
            }
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? tc("loading") : t("logPayment")}
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
