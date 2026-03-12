import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Home,
  User,
  CreditCard,
  Plus,
  History,
  ExternalLink,
  FileText,
  Phone,
  Mail,
  Globe,
  Wrench,
} from "lucide-react";
import MoveOutDialog from "@/components/units/MoveOutDialog";
import TenantCheques from "@/components/tenants/TenantCheques";
import TenantDocuments from "@/components/tenants/TenantDocuments";
import TenantNotes from "@/components/tenants/TenantNotes";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; unitId: string }>;
}) {
  const { locale, id: propertyId, unitId } = await params;
  const t = await getTranslations("units");
  const tt = await getTranslations("tenants");
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select("*, properties(name, location)")
    .eq("id", unitId)
    .single();

  if (!unit) {
    notFound();
  }

  // Fetch current tenant via active lease — full tenant record
  const { data: activeLease } = await supabase
    .from("leases")
    .select("*, tenants(*)")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentTenant = activeLease?.tenants as Record<string, unknown> | null;

  // Fetch all leases for this unit (for lease history section)
  const { data: allLeases } = await supabase
    .from("leases")
    .select("*, tenants(id, full_name, phone, email, nationality, national_id)")
    .eq("unit_id", unitId)
    .eq("is_active", false)
    .order("end_date", { ascending: false });

  // Fetch payments for this tenant
  const { data: tenantPayments } = currentTenant
    ? await supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", currentTenant.id as string)
        .order("payment_date", { ascending: false })
    : { data: null };

  // Fetch maintenance requests for this tenant
  const { data: maintenance } = currentTenant
    ? await supabase
        .from("maintenance_requests")
        .select("*")
        .eq("tenant_id", currentTenant.id as string)
        .order("created_at", { ascending: false })
    : { data: null };

  const property = unit.properties as Record<string, unknown> | null;

  const statusColors: Record<string, string> = {
    vacant: "bg-success/10 text-success",
    occupied: "bg-destructive/10 text-destructive",
    maintenance: "bg-warning/10 text-warning",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${locale}/properties/${propertyId}`}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold text-text-primary font-mono">
              {unit.unit_number}
            </h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                statusColors[unit.status || "vacant"]
              }`}
            >
              {t(unit.status || "vacant")}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            {(property?.name as string) || ""}{" "}
            {property?.location ? `- ${property.location}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unit.status === "vacant" && (
            <Link
              href={`/${locale}/tenants/new?unit_id=${unitId}`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("assignTenant")}
            </Link>
          )}
        </div>
      </div>

      {/* Unit Info */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <Home className="h-5 w-5 text-text-secondary" />
          {t("unitInfo")}
        </h2>
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("unitNumber")}
              </span>
              <p className="text-sm text-text-primary mt-1 font-mono">
                {unit.unit_number}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("floor")}
              </span>
              <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                {unit.floor ?? "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("unitType")}
              </span>
              <p className="text-sm text-text-primary mt-1 capitalize">
                {unit.unit_type || "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("sizeSqm")}
              </span>
              <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                {unit.size_sqm ? `${unit.size_sqm} m²` : "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("rentAmount")}
              </span>
              <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                {unit.rent_amount ? `${unit.rent_amount} OMR` : "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("status")}
              </span>
              <p className="mt-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    statusColors[unit.status || "vacant"]
                  }`}
                >
                  {t(unit.status || "vacant")}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CURRENT TENANT SECTIONS ── */}
      {currentTenant ? (
        <>
          {/* Tenant header with move-out action */}
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
              <User className="h-5 w-5 text-text-secondary" />
              {t("currentTenant")}
              <span className="text-sm font-normal text-text-secondary">
                — {currentTenant.full_name as string}
              </span>
            </h2>
            <MoveOutDialog
              unitId={unitId}
              leaseId={activeLease!.id}
              tenantName={currentTenant.full_name as string}
              leaseStartDate={activeLease!.start_date}
            />
          </div>

          {/* Profile */}
          <div>
            <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
              <User className="h-4 w-4 text-text-secondary" />
              {tt("profile")}
            </h3>
            <div className="bg-surface border border-border rounded-lg p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("fullName")}
                  </span>
                  <p className="text-sm text-text-primary mt-1">
                    {currentTenant.full_name as string}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("nationality")}
                  </span>
                  <p className="text-sm text-text-primary mt-1">
                    {(currentTenant.nationality as string) || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("nationalId")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono">
                    {(currentTenant.national_id as string) || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("phone")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono ltr-nums flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-text-secondary" />
                    {(currentTenant.phone as string) || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("email")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-text-secondary" />
                    {(currentTenant.email as string) || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("emergencyContact")}
                  </span>
                  <p className="text-sm text-text-primary mt-1">
                    {(currentTenant.emergency_contact as string) || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("languagePreference")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-text-secondary" />
                    {currentTenant.language_preference === "ar"
                      ? tt("languages.ar")
                      : tt("languages.en")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cheques */}
          <TenantCheques tenantId={currentTenant.id as string} />

          {/* Lease Info */}
          <div>
            <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-text-secondary" />
              {tt("leaseInfo")}
            </h3>
            <div className="bg-surface border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
                  {tt("leaseActive")}
                </span>
                {activeLease && (
                  <span className="text-xs text-text-secondary">
                    {Math.ceil(
                      (new Date(activeLease.end_date).getTime() - new Date().getTime()) /
                        (1000 * 60 * 60 * 24)
                    )}{" "}
                    {tt("daysRemaining")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("startDate")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                    {new Date(activeLease!.start_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("endDate")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                    {new Date(activeLease!.end_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("monthlyRent")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                    {activeLease!.monthly_rent ? `${activeLease!.monthly_rent} OMR` : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("securityDeposit")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                    {activeLease!.security_deposit
                      ? `${activeLease!.security_deposit} OMR`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Payments */}
          <div>
            <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-text-secondary" />
              {tt("payments")}
            </h3>
            {tenantPayments && tenantPayments.length > 0 ? (
              <div className="bg-surface border border-border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[550px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("paymentDate")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("amount")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("paymentMethod")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("reference")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tenantPayments.map((payment: Record<string, unknown>) => (
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
                <p className="text-sm text-text-secondary">{tt("noPayments")}</p>
              </div>
            )}
          </div>

          {/* Documents */}
          <TenantDocuments tenantId={currentTenant.id as string} />

          {/* Maintenance */}
          <div>
            <h3 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-text-secondary" />
              {tt("maintenance")}
            </h3>
            {maintenance && maintenance.length > 0 ? (
              <div className="bg-surface border border-border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("maintenanceDate")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("maintenanceTitle")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("maintenancePriority")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                        {tt("status")}
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
                <p className="text-sm text-text-secondary">{tt("noMaintenance")}</p>
              </div>
            )}
          </div>

          {/* Notes */}
          <TenantNotes tenantId={currentTenant.id as string} />
        </>
      ) : (
        <div>
          <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
            <User className="h-5 w-5 text-text-secondary" />
            {t("currentTenant")}
          </h2>
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <User className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary mb-3">{t("noTenant")}</p>
            {unit.status === "vacant" && (
              <Link
                href={`/${locale}/tenants/new?unit_id=${unitId}`}
                className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t("assignTenant")}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Tenant History */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <History className="h-5 w-5 text-text-secondary" />
          {t("tenantHistory")}
        </h2>
        {allLeases && allLeases.length > 0 ? (
          <div className="space-y-3">
            {allLeases.map((lease: Record<string, unknown>) => {
              const tenant = lease.tenants as Record<string, unknown> | null;
              return (
                <div
                  key={lease.id as string}
                  className="bg-surface border border-border rounded-lg p-5"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {tenant?.full_name as string}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5 font-mono ltr-nums">
                        {new Date(lease.start_date as string).toLocaleDateString()}
                        {" — "}
                        {new Date(lease.end_date as string).toLocaleDateString()}
                      </p>
                    </div>
                    {tenant && (
                      <Link
                        href={`/${locale}/tenants/${tenant.id}`}
                        className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t("viewProfile")}
                      </Link>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tt("phone")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                        {(tenant?.phone as string) || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tt("nationality")}
                      </span>
                      <p className="text-sm text-text-primary mt-1">
                        {(tenant?.nationality as string) || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tt("monthlyRent")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                        {lease.monthly_rent ? `${lease.monthly_rent} OMR` : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tt("securityDeposit")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                        {lease.security_deposit
                          ? `${lease.security_deposit} OMR`
                          : "—"}
                      </p>
                    </div>
                  </div>
                  {!!(tenant?.national_id) && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {tt("nationalId")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono">
                        {tenant.national_id as string}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <History className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{t("noPreviousTenants")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
