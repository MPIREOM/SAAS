"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { FileText } from "lucide-react";
import {
  ChequeFormRows,
  ChequeEntry,
} from "@/components/cheques/cheque-form-rows";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

interface Tenant {
  id: string;
  full_name: string;
  nationality: string | null;
  national_id: string | null;
  phone: string;
  email: string | null;
  emergency_contact: string | null;
  language_preference: string;
  status: string;
}

interface Lease {
  id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  payment_due_day: number;
  is_active: boolean;
  unit_number: string;
  property_name: string;
}

export default function EditTenantPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = use(params);
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const tch = useTranslations("cheques");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [cheques, setCheques] = useState<ChequeEntry[]>([]);
  const [chequesLoaded, setChequesLoaded] = useState(false);
  const [leases, setLeases] = useState<Lease[]>([]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // Load tenant
      const { data } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single();
      if (data) setTenant(data as Tenant);

      // Access control check — non-super-admins must have an assignment
      // for the tenant's property.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
        if (profile?.role !== "super_admin") {
          const { data: access } = await supabase
            .from("user_property_assignments")
            .select("property_id")
            .eq("user_id", user.id);
          const { data: leases } = await supabase
            .from("leases")
            .select("units(property_id)")
            .eq("tenant_id", id)
            .limit(1);
          const propId = (leases?.[0]?.units as unknown as { property_id: string })?.property_id;
          if (propId && access && !access.some(a => a.property_id === propId)) {
            router.push(`/${locale}/tenants`);
            return;
          }
        }
      }

      // Load leases
      const { data: leaseData } = await supabase
        .from("leases")
        .select("id, start_date, end_date, monthly_rent, security_deposit, payment_due_day, is_active, units(unit_number, properties:property_id(name))")
        .eq("tenant_id", id)
        .order("is_active", { ascending: false })
        .order("start_date", { ascending: false });

      if (leaseData) {
        setLeases(
          leaseData.map((l) => {
            const unit = l.units as unknown as Record<string, unknown> | null;
            const prop = unit?.properties as unknown as Record<string, unknown> | null;
            return {
              id: l.id,
              start_date: l.start_date,
              end_date: l.end_date,
              monthly_rent: l.monthly_rent,
              security_deposit: l.security_deposit,
              payment_due_day: l.payment_due_day || 1,
              is_active: l.is_active,
              unit_number: (unit?.unit_number as string) || "",
              property_name: (prop?.name as string) || "",
            };
          })
        );
      }

      // Load existing cheques
      const { data: existingCheques } = await supabase
        .from("cheques")
        .select("id, cheque_number, bank_name, cheque_date, amount, status")
        .eq("tenant_id", id)
        .order("cheque_date", { ascending: true });

      if (existingCheques) {
        setCheques(
          existingCheques.map((c) => ({
            id: c.id,
            cheque_number: c.cheque_number,
            bank_name: c.bank_name,
            cheque_date: c.cheque_date,
            amount: String(c.amount),
            status: c.status,
          }))
        );
      }
      setChequesLoaded(true);
    };
    load();
  }, [id, locale, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tenant) return;
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        full_name: formData.get("full_name") as string,
        nationality: (formData.get("nationality") as string) || null,
        national_id: (formData.get("national_id") as string) || null,
        phone: formData.get("phone") as string,
        email: (formData.get("email") as string) || null,
        emergency_contact:
          (formData.get("emergency_contact") as string) || null,
        language_preference: formData.get("language_preference") as string,
        status: formData.get("status") as string,
      })
      .eq("id", tenant.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    logAudit(supabase, {
      action: "update",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { full_name: formData.get("full_name") as string },
    });

    // Validate leases
    for (const lease of leases) {
      if (lease.start_date && lease.end_date && lease.end_date <= lease.start_date) {
        setError(t("leaseEndAfterStart", { unit: lease.unit_number }));
        setLoading(false);
        return;
      }
      if (lease.monthly_rent !== undefined && lease.monthly_rent <= 0) {
        setError(t("leaseRentPositive", { unit: lease.unit_number }));
        setLoading(false);
        return;
      }
    }

    // Update leases
    for (const lease of leases) {
      const { error: leaseError } = await supabase
        .from("leases")
        .update({
          start_date: lease.start_date,
          end_date: lease.end_date,
          monthly_rent: lease.monthly_rent,
          security_deposit: lease.security_deposit,
          payment_due_day: lease.payment_due_day,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lease.id);

      if (leaseError) {
        setError(leaseError.message);
        setLoading(false);
        return;
      }
    }

    // Insert only new cheques (ones without an id)
    const newCheques = cheques.filter(
      (c) => !c.id && c.cheque_number && c.bank_name && c.cheque_date && c.amount
    );
    if (newCheques.length > 0) {
      const { error: chequeError } = await supabase.from("cheques").insert(
        newCheques.map((c) => ({
          tenant_id: tenant.id,
          cheque_number: c.cheque_number,
          bank_name: c.bank_name,
          cheque_date: c.cheque_date,
          amount: c.amount,
          status: "pending" as const,
        }))
      );

      if (chequeError) {
        setError(chequeError.message);
        setLoading(false);
        return;
      }
    }

    router.push(`/${locale}/tenants/${tenant.id}`);
    router.refresh();
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center py-20" aria-busy="true">
        <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={t("editTenant")}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/tenants` },
          { label: tenant.full_name, href: `/${locale}/tenants/${tenant.id}` },
          { label: t("editTenant") },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Tenant fields */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <Input
            name="full_name"
            required
            label={`${t("fullName")} *`}
            defaultValue={tenant.full_name}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="phone"
              required
              label={`${t("phone")} *`}
              defaultValue={tenant.phone}
            />
            <Input
              name="email"
              type="email"
              label={t("email")}
              defaultValue={tenant.email || ""}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="nationality"
              label={t("nationality")}
              defaultValue={tenant.nationality || ""}
            />
            <Input
              name="national_id"
              label={t("nationalId")}
              defaultValue={tenant.national_id || ""}
              className="font-mono"
            />
          </div>

          <Input
            name="emergency_contact"
            label={t("emergencyContact")}
            defaultValue={tenant.emergency_contact || ""}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              name="language_preference"
              label={t("languagePreference")}
              defaultValue={tenant.language_preference}
            >
              <option value="en">{t("languages.en")}</option>
              <option value="ar">{t("languages.ar")}</option>
            </Select>
            <Input
              type="text"
              name="status"
              label={t("status")}
              value={tenant.status}
              readOnly
              className="capitalize cursor-not-allowed text-text-secondary"
              helperText={t("useMoveOutHint")}
            />
          </div>
        </div>

        {/* Lease Section */}
        {leases.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <FileText aria-hidden="true" className="h-4 w-4 text-accent" />
              {t("leaseInfo")}
            </h2>
            {leases.map((lease, idx) => (
              <div
                key={lease.id}
                className="border border-border/60 rounded-md p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    {lease.property_name} — {t("unit")} {lease.unit_number}
                  </span>
                  <Badge variant={lease.is_active ? "success" : "secondary"}>
                    {lease.is_active ? t("leaseActive") : t("leaseExpired")}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    type="date"
                    label={t("startDate")}
                    value={lease.start_date}
                    onChange={(e) => {
                      const updated = [...leases];
                      updated[idx] = { ...updated[idx], start_date: e.target.value };
                      setLeases(updated);
                    }}
                    className="font-mono"
                  />
                  <Input
                    type="date"
                    label={t("endDate")}
                    value={lease.end_date}
                    onChange={(e) => {
                      const updated = [...leases];
                      updated[idx] = { ...updated[idx], end_date: e.target.value };
                      setLeases(updated);
                    }}
                    className="font-mono"
                  />
                  <Input
                    type="number"
                    step={0.01}
                    min={0.01}
                    label={t("monthlyRent")}
                    value={lease.monthly_rent}
                    onChange={(e) => {
                      const updated = [...leases];
                      updated[idx] = { ...updated[idx], monthly_rent: Number(e.target.value) };
                      setLeases(updated);
                    }}
                    className="font-mono"
                  />
                  <Input
                    type="number"
                    step={0.01}
                    label={t("securityDeposit")}
                    value={lease.security_deposit ?? ""}
                    onChange={(e) => {
                      const updated = [...leases];
                      updated[idx] = { ...updated[idx], security_deposit: e.target.value ? Number(e.target.value) : null };
                      setLeases(updated);
                    }}
                    className="font-mono"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    label={t("paymentDueDay")}
                    value={lease.payment_due_day}
                    onChange={(e) => {
                      const updated = [...leases];
                      updated[idx] = { ...updated[idx], payment_due_day: Number(e.target.value) };
                      setLeases(updated);
                    }}
                    className="font-mono"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cheques Section */}
        {chequesLoaded && (
          <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <FileText aria-hidden="true" className="h-4 w-4 text-accent" />
              {tch("title")}
              {cheques.filter((c) => c.id).length > 0 && (
                <Badge variant="secondary">
                  {cheques.filter((c) => c.id).length}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-text-secondary">{tch("subtitle")}</p>
            <ChequeFormRows
              cheques={cheques}
              onChange={setCheques}
              showStatus
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={loading}>
            {loading ? tc("loading") : tc("save")}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
