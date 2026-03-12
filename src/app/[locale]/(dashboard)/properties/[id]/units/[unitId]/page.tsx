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
  Building2,
  Folder,
  FileText,
  Wrench,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; unitId: string }>;
}) {
  const { locale, id: propertyId, unitId } = await params;
  const t = await getTranslations("units");
  const tt = await getTranslations("tenants");
  const tc = await getTranslations("common");
  const td = await getTranslations("documents");
  const tch = await getTranslations("cheques");
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select("*, properties(name, location)")
    .eq("id", unitId)
    .single();

  if (!unit) {
    notFound();
  }

  // Fetch current tenant via active lease
  const { data: activeLease } = await supabase
    .from("leases")
    .select("*, tenants(id, full_name, phone, email, nationality, national_id, emergency_contact, language_preference, status)")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .single();

  const currentTenant = activeLease?.tenants as Record<string, unknown> | null;

  const tenantId = currentTenant?.id as string | undefined;

  // Fetch payment history for this unit's lease
  const { data: payments } = activeLease
    ? await supabase
        .from("payments")
        .select("*")
        .eq("lease_id", activeLease.id)
        .order("payment_date", { ascending: false })
    : { data: null };

  // Fetch cheques for this tenant
  const { data: cheques } = tenantId
    ? await supabase
        .from("cheques")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("cheque_date", { ascending: false })
    : { data: null };

  // Fetch documents for this tenant
  const { data: documents } = tenantId
    ? await supabase
        .from("documents")
        .select("*")
        .eq("entity_type", "tenant")
        .eq("entity_id", tenantId)
        .order("uploaded_at", { ascending: false })
    : { data: null };

  // Fetch maintenance requests for this tenant
  const { data: maintenance } = tenantId
    ? await supabase
        .from("maintenance_requests")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
    : { data: null };

  const property = unit.properties as Record<string, unknown> | null;
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const statusColors: Record<string, string> = {
    vacant: "bg-success/10 text-success",
    occupied: "bg-accent/10 text-accent",
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
              href={`/${locale}/tenants/new?unitId=${unitId}&propertyId=${propertyId}&rentAmount=${unit.rent_amount || ""}`}
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

      {/* Current Tenant */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <User className="h-5 w-5 text-text-secondary" />
          {t("currentTenant")}
        </h2>
        {currentTenant ? (
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <div>
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  {tt("fullName")}
                </span>
                <p className="text-sm mt-1">
                  <Link
                    href={`/${locale}/tenants/${currentTenant.id}`}
                    className="text-text-primary hover:text-accent transition-colors"
                  >
                    {currentTenant.full_name as string}
                  </Link>
                </p>
              </div>
              <div>
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  {tt("phone")}
                </span>
                <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                  {(currentTenant.phone as string) || "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  {tt("email")}
                </span>
                <p className="text-sm text-text-primary mt-1">
                  {(currentTenant.email as string) || "—"}
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
                  {tt("emergencyContact")}
                </span>
                <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                  {(currentTenant.emergency_contact as string) || "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  {tt("languagePreference")}
                </span>
                <p className="text-sm text-text-primary mt-1 uppercase">
                  {(currentTenant.language_preference as string) || "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  {tt("monthlyRent")}
                </span>
                <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                  {activeLease?.monthly_rent
                    ? `${activeLease.monthly_rent} OMR`
                    : "—"}
                </p>
              </div>
            </div>
            {activeLease && (
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-5">
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("startDate")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                    {new Date(activeLease.start_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("endDate")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                    {new Date(activeLease.end_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {tt("securityDeposit")}
                  </span>
                  <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                    {activeLease.security_deposit
                      ? `${activeLease.security_deposit} OMR`
                      : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <User className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary mb-3">{t("noTenant")}</p>
            <Link
              href={`/${locale}/tenants/new?unitId=${unitId}&propertyId=${propertyId}&rentAmount=${unit.rent_amount || ""}`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("assignTenant")}
            </Link>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-text-secondary" />
          {t("paymentHistory")}
        </h2>
        {payments && payments.length > 0 ? (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full">
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
            <p className="text-sm text-text-secondary">{tt("noPayments")}</p>
          </div>
        )}
      </div>

      {/* Cheques */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-text-secondary" />
          {tch("title")}
        </h2>
        {cheques && cheques.length > 0 ? (
          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {tch("chequeNumber")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {tch("bankName")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {tch("chequeDate")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {tch("amount")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {tch("status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cheques.map((cheque: Record<string, unknown>) => (
                  <tr
                    key={cheque.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono">
                        {cheque.cheque_number as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {cheque.bank_name as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono ltr-nums">
                        {new Date(cheque.cheque_date as string).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono ltr-nums">
                        {cheque.amount as number} OMR
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          cheque.status === "cleared"
                            ? "bg-success/10 text-success"
                            : cheque.status === "pending"
                            ? "bg-warning/10 text-warning"
                            : cheque.status === "bounced"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-text-secondary/10 text-text-secondary"
                        }`}
                      >
                        {cheque.status as string}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <FileText className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{tt("noPayments")}</p>
          </div>
        )}
      </div>

      {/* Documents */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <Folder className="h-5 w-5 text-text-secondary" />
          {td("title")}
        </h2>
        {documents && documents.length > 0 ? (
          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[550px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {td("fileName")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {td("documentType")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {td("expiryDate")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {td("uploadDate")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map((doc: Record<string, unknown>) => {
                  const expiryDate = doc.expiry_date
                    ? new Date(doc.expiry_date as string)
                    : null;
                  const isExpiringSoon =
                    expiryDate && expiryDate <= thirtyDaysFromNow && expiryDate >= now;
                  const isExpired = expiryDate && expiryDate < now;

                  return (
                    <tr
                      key={doc.id as string}
                      className="hover:bg-surface-elevated/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-text-primary">
                          {(doc.file_name as string) || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
                          {((doc.document_type as string) || "").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-mono ltr-nums ${
                              isExpired
                                ? "text-destructive"
                                : isExpiringSoon
                                ? "text-warning"
                                : "text-text-secondary"
                            }`}
                          >
                            {expiryDate ? expiryDate.toLocaleDateString() : "—"}
                          </span>
                          {(isExpiringSoon || isExpired) && (
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary font-mono ltr-nums">
                          {new Date(doc.uploaded_at as string).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {Boolean(doc.file_url) ? (
                          <a
                            href={doc.file_url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:text-accent-hover transition-colors"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <Folder className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{tt("noDocuments")}</p>
          </div>
        )}
      </div>

      {/* Maintenance */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-text-secondary" />
          {tt("maintenance")}
        </h2>
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
    </div>
  );
}
