import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  User,
  FileText,
  CreditCard,
  Folder,
  Wrench,
  StickyNote,
  LogOut,
  Phone,
  Mail,
  Globe,
  Shield,
  Pencil,
} from "lucide-react";
import TenantDocuments from "@/components/tenants/TenantDocuments";
import TenantCheques from "@/components/tenants/TenantCheques";
import TenantNotes from "@/components/tenants/TenantNotes";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("tenants");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single();

  if (!tenant) {
    notFound();
  }

  // Fetch active leases with unit and property info
  const { data: leases } = await supabase
    .from("leases")
    .select(`
      *,
      units(unit_number, floor, unit_type, property_id, properties(name, location))
    `)
    .eq("tenant_id", id)
    .order("start_date", { ascending: false });

  // Fetch payments for this tenant
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("tenant_id", id)
    .order("payment_date", { ascending: false });

  // Fetch maintenance requests
  const { data: maintenance } = await supabase
    .from("maintenance_requests")
    .select("*")
    .eq("tenant_id", id)
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    active: "bg-success/10 text-success",
    archived: "bg-text-secondary/10 text-text-secondary",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${locale}/tenants`}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold text-text-primary">
              {tenant.full_name}
            </h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                statusColors[tenant.status || "active"]
              }`}
            >
              {t(tenant.status || "active")}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            {t("tenantId")}: <span className="font-mono">{tenant.id}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/tenants/${id}/edit`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            {t("editTenant")}
          </Link>
          {tenant.status === "active" && (
            <Link
              href={`/${locale}/tenants/${id}/move-out`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t("moveOut")}
            </Link>
          )}
        </div>
      </div>

      {/* Profile Section */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <User className="h-5 w-5 text-text-secondary" />
          {t("profile")}
        </h2>
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("fullName")}
              </span>
              <p className="text-sm text-text-primary mt-1">{tenant.full_name}</p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("nationality")}
              </span>
              <p className="text-sm text-text-primary mt-1">
                {tenant.nationality || "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("nationalId")}
              </span>
              <p className="text-sm text-text-primary mt-1 font-mono">
                {tenant.national_id || "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("phone")}
              </span>
              <p className="text-sm text-text-primary mt-1 font-mono ltr-nums flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-text-secondary" />
                {tenant.phone}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("email")}
              </span>
              <p className="text-sm text-text-primary mt-1 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-text-secondary" />
                {tenant.email || "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("emergencyContact")}
              </span>
              <p className="text-sm text-text-primary mt-1">
                {tenant.emergency_contact || "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("languagePreference")}
              </span>
              <p className="text-sm text-text-primary mt-1 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-text-secondary" />
                {tenant.language_preference === "ar" ? t("languages.ar") : t("languages.en")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cheques Section */}
      <TenantCheques tenantId={id} />

      {/* Lease Info Section */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-text-secondary" />
          {t("leaseInfo")}
        </h2>
        {leases && leases.length > 0 ? (
          <div className="space-y-3">
            {leases.map((lease: Record<string, unknown>) => {
              const unit = lease.units as Record<string, unknown> | null;
              const property = unit?.properties as Record<string, unknown> | null;
              const startDate = new Date(lease.start_date as string);
              const endDate = new Date(lease.end_date as string);
              const now = new Date();
              const daysRemaining = Math.ceil(
                (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              );

              return (
                <div
                  key={lease.id as string}
                  className="bg-surface border border-border rounded-lg p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        lease.is_active
                          ? "bg-success/10 text-success"
                          : "bg-text-secondary/10 text-text-secondary"
                      }`}
                    >
                      {lease.is_active ? t("leaseActive") : t("leaseExpired")}
                    </span>
                    {Boolean(lease.is_active) && daysRemaining > 0 && (
                      <span className="text-xs text-text-secondary">
                        {daysRemaining} {t("daysRemaining")}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {t("property")}
                      </span>
                      <p className="text-sm text-text-primary mt-1">
                        {(property?.name as string) || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {t("unit")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono">
                        {(unit?.unit_number as string) || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {t("startDate")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                        {startDate.toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {t("endDate")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                        {endDate.toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {t("monthlyRent")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                        {lease.monthly_rent as number} OMR
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {t("securityDeposit")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                        {(lease.security_deposit as number) || 0} OMR
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <FileText className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{t("noLeases")}</p>
          </div>
        )}
      </div>

      {/* Payments Section */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-text-secondary" />
          {t("payments")}
        </h2>
        {payments && payments.length > 0 ? (
          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[550px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("paymentDate")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("amount")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("paymentMethod")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("reference")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((payment: Record<string, unknown>) => (
                  <tr
                    key={payment.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono ltr-nums">
                        {new Date(payment.payment_date as string).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono ltr-nums">
                        {payment.amount as number} OMR
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary capitalize">
                        {(payment.payment_method as string) || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary font-mono">
                        {(payment.reference_number as string) || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          payment.status === "paid"
                            ? "bg-success/10 text-success"
                            : payment.status === "pending"
                            ? "bg-warning/10 text-warning"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {payment.status as string}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <CreditCard className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{t("noPayments")}</p>
          </div>
        )}
      </div>

      {/* Documents Section */}
      <TenantDocuments tenantId={id} />

      {/* Maintenance Section */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-text-secondary" />
          {t("maintenance")}
        </h2>
        {maintenance && maintenance.length > 0 ? (
          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("maintenanceDate")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("maintenanceTitle")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("maintenancePriority")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {maintenance.map((req: Record<string, unknown>) => (
                  <tr
                    key={req.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono ltr-nums">
                        {new Date(req.created_at as string).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary">
                        {req.title as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary capitalize">
                        {(req.priority as string) || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          req.status === "resolved"
                            ? "bg-success/10 text-success"
                            : req.status === "in_progress"
                            ? "bg-warning/10 text-warning"
                            : "bg-accent/10 text-accent"
                        }`}
                      >
                        {req.status as string}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <Wrench className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{t("noMaintenance")}</p>
          </div>
        )}
      </div>

      {/* Notes Section */}
      <TenantNotes tenantId={id} />
    </div>
  );
}
