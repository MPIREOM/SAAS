import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { getDocumentUrls } from "@/lib/utils/document-url";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShareLinkButton } from "@/components/maintenance/share-link-button";
import { SharePortalButton } from "@/components/tenants/share-portal-button";
import {
  ArrowLeft,
  User,
  FileText,
  CreditCard,
  Folder,
  Wrench,
  LogOut,
  Phone,
  Mail,
  Globe,
  Pencil,
  Upload,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Banknote,
  Hash,
  Shield,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("tenants");
  const tc = await getTranslations("common");
  const td = await getTranslations("documents");
  const tch = await getTranslations("cheques");
  const ti = await getTranslations("invoices");
  const tm = await getTranslations("maintenance");
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single();

  if (!tenant) {
    notFound();
  }

  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null) {
    const { data: tenantLeases } = await supabase
      .from("leases")
      .select("units(property_id)")
      .eq("tenant_id", id)
      .limit(1);
    const tenantPropertyId = (tenantLeases?.[0]?.units as unknown as { property_id: string })?.property_id;
    if (tenantPropertyId && !propertyIds.includes(tenantPropertyId)) {
      notFound();
    }
  }

  // Fetch leases, payments, maintenance, documents, cheques in parallel
  const [leasesRes, paymentsRes, maintenanceRes, documentsRes, chequesRes] =
    await Promise.all([
      supabase
        .from("leases")
        .select(
          `*, units(unit_number, floor, unit_type, property_id, properties(name, location))`
        )
        .eq("tenant_id", id)
        .order("start_date", { ascending: false }),
      supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", id)
        .order("payment_date", { ascending: false }),
      supabase
        .from("maintenance_requests")
        .select("*")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("*")
        .eq("entity_type", "tenant")
        .eq("entity_id", id)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("cheques")
        .select("*")
        .eq("tenant_id", id)
        .order("cheque_date", { ascending: false }),
    ]);

  const leases = leasesRes.data;
  const payments = paymentsRes.data;
  const maintenance = maintenanceRes.data;
  const documents = documentsRes.data;
  const cheques = chequesRes.data;

  // Generate signed URLs for document downloads
  const docUrlMap = documents && documents.length > 0
    ? await getDocumentUrls(supabase, documents as Array<{ file_url: string }>)
    : new Map<string, string>();

  const now = new Date();
  const thirtyDaysFromNow = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  // Find move-out lease for archived tenants
  const moveOutLease =
    tenant.status === "archived" && leases
      ? leases.find(
          (l: Record<string, unknown>) => l.vacate_date
        ) || leases.find((l: Record<string, unknown>) => !l.is_active) || null
      : null;

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
            <h1 className="text-2xl font-semibold text-text-primary font-display">
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
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Pencil className="h-4 w-4" />
            {t("editTenant")}
          </Link>
          <SharePortalButton
            tenantId={id}
            tenantName={tenant.full_name}
            tenantPhone={tenant.phone}
            locale={locale}
          />
          <Link
            href={`/${locale}/tenants/${id}/statement`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:border-accent/30 hover:text-accent transition-colors"
          >
            <ScrollText className="h-4 w-4" />
            Statement
          </Link>
          {tenant.status === "active" && (
            <>
              <Link
                href={`/${locale}/tenants/${id}/renew-lease`}
                className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:border-accent/30 hover:text-accent transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Renew Lease
              </Link>
              <ShareLinkButton
                tenantId={id}
                tenantName={tenant.full_name}
                tenantPhone={tenant.phone}
                leases={(leases || []).map((l: Record<string, unknown>) => ({
                  id: l.id as string,
                  unit_id: l.unit_id as string,
                  is_active: l.is_active as boolean,
                  units: {
                    unit_number: ((l.units as Record<string, unknown>)?.unit_number as string) || "",
                  },
                }))}
                locale={locale}
              />
              <Link
                href={`/${locale}/tenants/${id}/move-out`}
                className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t("moveOut")}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Move-out Summary (archived tenants only) */}
      {tenant.status === "archived" && moveOutLease && (
        <div className="bg-surface border border-destructive/30 rounded-lg p-6">
          <h2 className="text-lg font-medium text-text-primary mb-4 font-display flex items-center gap-2">
            <LogOut className="h-5 w-5 text-destructive" />
            {t("moveOutSummary")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("vacateDate")}
              </span>
              <p className="text-sm text-text-primary mt-1 font-mono ltr-nums flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-text-secondary" />
                {moveOutLease.vacate_date
                  ? new Date(
                      moveOutLease.vacate_date as string
                    ).toLocaleDateString()
                  : "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("vacateReason")}
              </span>
              <p className="text-sm text-text-primary mt-1">
                {moveOutLease.vacate_reason
                  ? t(`reasons.${moveOutLease.vacate_reason}`)
                  : "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("depositStatus")}
              </span>
              <p className="mt-1">
                {moveOutLease.deposit_status ? (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      moveOutLease.deposit_status === "refunded"
                        ? "bg-success/10 text-success"
                        : moveOutLease.deposit_status === "pending"
                          ? "bg-warning/10 text-warning"
                          : moveOutLease.deposit_status === "deducted"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-text-secondary/10 text-text-secondary"
                    }`}
                  >
                    {t(`depositStatuses.${moveOutLease.deposit_status}`)}
                  </span>
                ) : (
                  <span className="text-sm text-text-primary">—</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("finalInspection")}
              </span>
              <p className="text-sm text-text-primary mt-1 flex items-center gap-1.5">
                {moveOutLease.final_inspection ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {tc("yes")}
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    {tc("no")}
                  </>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs text-text-secondary uppercase tracking-wider">
                {t("keysReturned")}
              </span>
              <p className="text-sm text-text-primary mt-1 flex items-center gap-1.5">
                {moveOutLease.keys_returned ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {tc("yes")}
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    {tc("no")}
                  </>
                )}
              </p>
            </div>
            {moveOutLease.vacate_notes && (
              <div className="sm:col-span-2 lg:col-span-3">
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  {t("vacateNotes")}
                </span>
                <p className="text-sm text-text-primary mt-1">
                  {moveOutLease.vacate_notes as string}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Section */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 font-display flex items-center gap-2">
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

      {/* Lease Info Section */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 font-display flex items-center gap-2">
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
                        {lease.monthly_rent as number} {CURRENCY.code}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-secondary uppercase tracking-wider">
                        {t("securityDeposit")}
                      </span>
                      <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
                        {(lease.security_deposit as number) || 0} {CURRENCY.code}
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
        <h2 className="text-lg font-medium text-text-primary mb-3 font-display flex items-center gap-2">
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
                    {t("notes")}
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
                        {payment.amount as number} {CURRENCY.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {payment.method ? ti(`methods.${payment.method}`) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {payment.method === "cheque" && payment.reference_number ? (
                        <a
                          href="#cheques-section"
                          className="text-sm text-accent font-mono font-medium hover:underline"
                        >
                          {payment.reference_number as string}
                        </a>
                      ) : (
                        <span className="text-sm text-text-secondary font-mono">
                          {(payment.reference_number as string) || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {(payment.notes as string) || "—"}
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

      {/* Cheques Section */}
      <div id="cheques-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-text-primary font-display flex items-center gap-2">
            <Banknote className="h-5 w-5 text-text-secondary" />
            {tch("title")}
            {cheques && cheques.length > 0 && (
              <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
                {cheques.length}
              </span>
            )}
          </h2>
        </div>
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
                  <th className="text-end text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
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
                      <span className="text-sm text-text-primary font-mono font-medium">
                        #{cheque.cheque_number as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {cheque.bank_name as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-primary font-mono ltr-nums">
                        {new Date(
                          cheque.cheque_date as string
                        ).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span className="text-sm font-bold text-text-primary font-mono ltr-nums">
                        {Number(cheque.amount).toLocaleString("en-OM", {
                          minimumFractionDigits: 2,
                        })}
                        <span className="text-[10px] font-normal text-text-secondary ms-1">
                          {CURRENCY.code}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                          cheque.status === "cleared"
                            ? "bg-success/10 text-success"
                            : cheque.status === "pending"
                              ? "bg-warning/10 text-warning"
                              : cheque.status === "bounced"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-text-secondary/10 text-text-secondary"
                        }`}
                      >
                        {cheque.status === "cleared" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : cheque.status === "pending" ? (
                          <Clock className="h-3 w-3" />
                        ) : cheque.status === "bounced" ? (
                          <XCircle className="h-3 w-3" />
                        ) : null}
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
            <Banknote className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{tch("noCheques")}</p>
          </div>
        )}
      </div>

      {/* Documents Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-text-primary font-display flex items-center gap-2">
            <Folder className="h-5 w-5 text-text-secondary" />
            {td("title")}
            {documents && documents.length > 0 && (
              <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
                {documents.length}
              </span>
            )}
          </h2>
          <Link
            href={`/${locale}/documents/upload?entity_type=tenant&entity_id=${id}`}
            className="inline-flex items-center gap-2 h-8 px-3 bg-accent hover:bg-accent-hover text-background text-xs font-medium rounded-md transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            {td("upload")}
          </Link>
        </div>
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
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map((doc: Record<string, unknown>) => {
                  const expiryDate = doc.expiry_date
                    ? new Date(doc.expiry_date as string)
                    : null;
                  const isExpiringSoon =
                    expiryDate &&
                    expiryDate <= thirtyDaysFromNow &&
                    expiryDate >= now;
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
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
                          {((doc.document_type as string) || "").replace(
                            /_/g,
                            " "
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-sm font-mono ltr-nums ${
                              isExpired
                                ? "text-destructive font-medium"
                                : isExpiringSoon
                                  ? "text-warning font-medium"
                                  : "text-text-secondary"
                            }`}
                          >
                            {expiryDate
                              ? expiryDate.toLocaleDateString()
                              : "—"}
                          </span>
                          {isExpired && (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          )}
                          {isExpiringSoon && !isExpired && (
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary font-mono ltr-nums">
                          {new Date(
                            doc.uploaded_at as string
                          ).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {Boolean(doc.file_url) && docUrlMap.get(doc.file_url as string) ? (
                          <a
                            href={docUrlMap.get(doc.file_url as string)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors inline-flex"
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
            <p className="text-sm text-text-secondary">{t("noDocuments")}</p>
          </div>
        )}
      </div>

      {/* Maintenance Section */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-3 font-display flex items-center gap-2">
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
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${
                          req.status === "resolved"
                            ? "bg-success/10 text-success"
                            : req.status === "in_progress"
                              ? "bg-warning/10 text-warning"
                              : "bg-accent/10 text-accent"
                        }`}
                      >
                        {req.status === "resolved" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : req.status === "in_progress" ? (
                          <Clock className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {req.status ? tm(`statuses.${req.status}`) : ""}
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
    </div>
  );
}
