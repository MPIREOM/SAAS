import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY, formatAmount } from "@/lib/currency";
import { getDocumentUrl, getDocumentUrls } from "@/lib/utils/document-url";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Home,
  User,
  CreditCard,
  Plus,
  Folder,
  FileText,
  Wrench,
  ExternalLink,
  MapPin,
  Phone,
  Mail,
  Shield,
  Globe,
  Calendar,
  Banknote,
  Hash,
  Layers,
  Ruler,
  BedDouble,
  CheckCircle2,
  Clock,
  LogOut,
  FileDown,
  Receipt,
  RefreshCw,
  ArrowRightLeft,
  FileSignature,
  AlertTriangle,
  Landmark,
} from "lucide-react";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { UnitStatusToggle } from "@/components/units/unit-status-toggle";
import { AddChequeDialog } from "@/components/cheques/add-cheque-dialog";
import { MarkPaidButton } from "@/components/invoices/mark-paid-button";
import { CancelInvoiceButton } from "@/components/invoices/cancel-invoice-button";
import { RevertPaidButton } from "@/components/invoices/revert-paid-button";
import { EditInvoiceButton } from "@/components/invoices/edit-invoice-button";
import { EditPaymentMethod } from "@/components/payments/edit-payment-method";
import { ChequeActions } from "@/components/cheques/cheque-actions";
import { AgreementActions } from "@/components/agreements/agreement-actions";
import { RecordViolationDialog } from "@/components/agreements/record-violation-dialog";
import { MunicipalityContractDialog } from "@/components/units/municipality-contract-dialog";
import { GARBAGE_VIOLATION_FEE, LOST_KEY_FEE } from "@/lib/agreements/terms";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";

type BadgeVariant =
  | "default"
  | "secondary"
  | "warning"
  | "destructive"
  | "success"
  | "outline";

const INVOICE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  paid: "success",
  overdue: "destructive",
  partial: "default",
  pending: "warning",
};

const CHEQUE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  cleared: "success",
  pending: "warning",
  bounced: "destructive",
};

const MAINTENANCE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  open: "warning",
  in_progress: "default",
  resolved: "success",
  closed: "secondary",
};

const AGREEMENT_STATE_VARIANTS: Record<string, BadgeVariant> = {
  signed: "success",
  pending: "warning",
  failed: "destructive",
  none: "secondary",
};

const URGENCY_VARIANTS: Record<string, BadgeVariant> = {
  emergency: "destructive",
  high: "warning",
  medium: "default",
  low: "secondary",
};

const formatMoney = (value: unknown) =>
  formatAmount(Number(value || 0));

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
  const tm = await getTranslations("maintenance");
  const ti = await getTranslations("invoices");
  const tl = await getTranslations("leases");
  const tp = await getTranslations("properties");
  const ta = await getTranslations("tenantAgreement");
  const tmc = await getTranslations("municipalityContract");
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select("*, properties(name, location)")
    .eq("id", unitId)
    .single();

  if (!unit) {
    notFound();
  }

  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null && !propertyIds.includes(propertyId)) {
    notFound();
  }

  // Fetch current tenant via active lease
  const { data: activeLease } = await supabase
    .from("leases")
    .select(
      "*, tenants(id, full_name, phone, email, nationality, national_id, emergency_contact, language_preference, status)"
    )
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .single();

  const currentTenant = activeLease?.tenants as Record<
    string,
    unknown
  > | null;
  const tenantId = currentTenant?.id as string | undefined;

  // Fetch payment history, cheques, documents, maintenance in parallel
  const [paymentsRes, chequesRes, documentsRes, maintenanceRes, pastLeasesRes, invoicesRes, agreementRes, violationsRes, municipalityContractRes] =
    await Promise.all([
      activeLease
        ? supabase
            .from("payments")
            .select("*")
            .eq("lease_id", activeLease.id)
            .order("payment_date", { ascending: false })
        : Promise.resolve({ data: null }),
      tenantId
        ? supabase
            .from("cheques")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("cheque_date", { ascending: false })
        : Promise.resolve({ data: null }),
      // The current tenant's documents plus the unit's own (signed
      // building-rules agreements stay with the unit).
      supabase
        .from("documents")
        .select("*")
        .or(
          tenantId
            ? `and(entity_type.eq.tenant,entity_id.eq.${tenantId}),and(entity_type.eq.unit,entity_id.eq.${unitId})`
            : `and(entity_type.eq.unit,entity_id.eq.${unitId})`
        )
        .order("uploaded_at", { ascending: false }),
      supabase
            .from("maintenance_requests")
            .select("*")
            .eq("unit_id", unitId)
            .order("created_at", { ascending: false }),
      supabase
        .from("leases")
        .select("*, tenants(id, full_name, phone, status)")
        .eq("unit_id", unitId)
        .eq("is_active", false)
        .order("vacate_date", { ascending: false }),
      activeLease
        ? supabase
            .from("invoices")
            .select("id, tenant_id, amount, paid_amount, due_date, period_start, period_end, status")
            .eq("lease_id", activeLease.id)
            .in("status", ["pending", "overdue", "partial", "paid"])
            .order("due_date", { ascending: false })
        : Promise.resolve({ data: null }),
      tenantId
        ? supabase
            .from("tenant_agreements")
            .select("id, reference, token, status, sent_at, last_sent_at, reminder_count, last_send_error, signed_at, signer_name, garbage_fee, key_fee")
            .eq("tenant_id", tenantId)
            .eq("unit_id", unitId)
            .neq("status", "cancelled")
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("tenant_violations")
        .select("id, kind, quantity, amount, occurred_on, notes, tenant_id, invoices(invoice_number, status)")
        .eq("unit_id", unitId)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20),
      tenantId
        ? supabase
            .from("municipality_contracts")
            .select("id, contract_number, start_date, end_date, file_url")
            .eq("tenant_id", tenantId)
            .eq("unit_id", unitId)
            .order("end_date", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const payments = paymentsRes.data;
  const cheques = chequesRes.data;
  const documents = documentsRes.data;
  const maintenance = maintenanceRes.data;
  const pastLeases = pastLeasesRes.data;
  const municipalityContract = municipalityContractRes.data as {
    id: string;
    contract_number: string;
    start_date: string;
    end_date: string;
    file_url: string | null;
  } | null;
  const municipalityContractExpired =
    !!municipalityContract &&
    municipalityContract.end_date <
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Muscat" });
  const municipalityContractUrl = municipalityContract?.file_url
    ? await getDocumentUrl(supabase, municipalityContract.file_url)
    : null;
  const agreement = agreementRes.data as {
    id: string;
    reference: string;
    token: string;
    status: "pending" | "signed";
    sent_at: string | null;
    last_sent_at: string | null;
    reminder_count: number;
    last_send_error: string | null;
    signed_at: string | null;
    signer_name: string | null;
    garbage_fee: number | string;
    key_fee: number | string;
  } | null;
  const violations = (violationsRes.data ?? []) as unknown as Array<{
    id: string;
    kind: "garbage" | "lost_key";
    quantity: number;
    amount: number | string;
    occurred_on: string;
    notes: string | null;
    tenant_id: string;
    invoices: { invoice_number: string | null; status: string } | null;
  }>;
  const agreementState: "none" | "pending" | "signed" | "failed" = !agreement
    ? "none"
    : agreement.status === "signed"
      ? "signed"
      : agreement.last_send_error && !agreement.sent_at
        ? "failed"
        : agreement.sent_at
          ? "pending"
          : "none";
  const invoices = invoicesRes.data as Array<{
    id: string;
    tenant_id: string;
    amount: number | string;
    paid_amount: number | string | null;
    due_date: string;
    period_start: string | null;
    period_end: string | null;
    status: "pending" | "overdue" | "partial" | "paid";
  }> | null;

  const invoiceTenantName = (currentTenant?.full_name as string) || "—";

  // Roll up totals across the active lease's invoices for the summary cards.
  // Pending bucket includes overdue + partial (anything not fully settled).
  const invoiceTotals = (invoices || []).reduce(
    (acc, inv) => {
      const amount = Number(inv.amount) || 0;
      const paid = Number(inv.paid_amount) || 0;
      const remaining = Math.max(0, amount - paid);
      if (inv.status === "paid") {
        acc.paidCount += 1;
        acc.paidAmount += amount;
      } else {
        acc.pendingCount += 1;
        acc.pendingAmount += remaining;
      }
      return acc;
    },
    { paidCount: 0, paidAmount: 0, pendingCount: 0, pendingAmount: 0 }
  );

  // Generate signed URLs for document downloads
  const docUrlMap = documents && documents.length > 0
    ? await getDocumentUrls(supabase, documents as Array<{ file_url: string }>)
    : new Map<string, string>();

  const property = unit.properties as Record<string, unknown> | null;
  const now = new Date();
  const thirtyDaysFromNow = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  const statusMeta: Record<
    string,
    { variant: BadgeVariant; className?: string; icon: typeof CheckCircle2 }
  > = {
    vacant: { variant: "success", icon: CheckCircle2 },
    occupied: {
      variant: "outline",
      className: "bg-info-tint text-info border-info/30",
      icon: User,
    },
    maintenance: { variant: "warning", icon: Wrench },
  };

  const unitStatus = (unit.status as string) || "vacant";
  const status = statusMeta[unitStatus] || statusMeta.vacant;
  const StatusIcon = status.icon;

  const chequeStatusLabel = (chequeStatus: string) =>
    ["pending", "cleared", "bounced", "cancelled"].includes(chequeStatus)
      ? tch(`statuses.${chequeStatus}`)
      : chequeStatus;

  const unitFacts = [
    {
      label: t("unitNumber"),
      value: unit.unit_number,
      icon: Hash,
      mono: true,
    },
    {
      label: t("floor"),
      value: unit.floor ?? "—",
      icon: Layers,
      mono: true,
    },
    {
      label: t("bedrooms"),
      value:
        unit.bedrooms != null
          ? unit.bedrooms === 0
            ? t("types.studio")
            : String(unit.bedrooms)
          : "—",
      icon: BedDouble,
      mono: true,
    },
    {
      label: t("unitCategory"),
      value: unit.unit_type ? t(`types.${unit.unit_type}`) : "—",
      icon: Home,
      capitalize: true,
    },
    {
      label: t("sizeSqm"),
      value: unit.size_sqm ? `${unit.size_sqm} m²` : "—",
      icon: Ruler,
      mono: true,
    },
    {
      label: t("rentAmount"),
      value: unit.rent_amount
        ? `${formatAmount(Number(unit.rent_amount))} ${CURRENCY.code}`
        : "—",
      icon: Banknote,
      mono: true,
      highlight: true,
    },
    {
      label: t("electricityMeterNo"),
      value: unit.electricity_meter_no || "—",
      icon: Hash,
      mono: true,
    },
    {
      label: t("waterMeterNo"),
      value: unit.water_meter_no || "—",
      icon: Hash,
      mono: true,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title={unit.unit_number}
        breadcrumbs={[
          { label: tp("title"), href: `/${locale}/properties` },
          {
            label: (property?.name as string) || "—",
            href: `/${locale}/properties/${propertyId}`,
          },
          { label: unit.unit_number },
        ]}
      >
        {unitStatus === "vacant" && (
          <Link
            href={`/${locale}/tenants/new?unitId=${unitId}&propertyId=${propertyId}&rentAmount=${unit.rent_amount || ""}`}
            className={buttonVariants()}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("assignTenant")}
          </Link>
        )}
      </PageHeader>

      {/* Status + location strip */}
      <div className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge variant={status.variant} className={`gap-1 ${status.className ?? ""}`}>
          <StatusIcon aria-hidden="true" className="h-3 w-3" />
          {t(unitStatus)}
        </Badge>
        <UnitStatusToggle unitId={unitId} currentStatus={unitStatus} />
        <span className="flex items-center gap-1.5 text-sm text-text-secondary min-w-0">
          <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
          <span className="truncate">
            {(property?.name as string) || ""}
            {property?.location ? ` — ${property.location}` : ""}
          </span>
        </span>
      </div>

      {/* Unit facts */}
      <section className="bg-surface border border-border rounded-xl shadow-card p-5">
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-5">
          {unitFacts.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="min-w-0">
                <dt className="flex items-center gap-1 text-[12.5px] font-medium text-text-secondary">
                  <Icon
                    aria-hidden="true"
                    className="h-3 w-3 text-text-tertiary"
                  />
                  {item.label}
                </dt>
                <dd
                  className={`mt-1 text-sm font-medium truncate ${
                    item.highlight ? "text-accent font-semibold" : "text-text-primary"
                  }    ${item.mono ? "tabular-nums ltr-nums" : ""}    ${item.capitalize ? "capitalize" : ""}`}
                >
                  {item.value}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {/* Current Tenant */}
      <section>
        <SectionHeading icon={User} title={t("currentTenant")} />

        {currentTenant ? (
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
            {/* Tenant header */}
            <div className="p-5 border-b border-border">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-accent-tint border border-accent/30 flex items-center justify-center shrink-0">
                    <User aria-hidden="true" className="h-5 w-5 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/${locale}/tenants/${currentTenant.id}`}
                      className="text-base font-semibold text-text-primary hover:text-accent transition-colors font-display focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                    >
                      {currentTenant.full_name as string}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      {currentTenant.phone ? (
                        <span className="text-xs text-text-secondary flex items-center gap-1 tabular-nums ltr-nums">
                          <Phone aria-hidden="true" className="h-3 w-3" />
                          {currentTenant.phone as string}
                        </span>
                      ) : null}
                      {currentTenant.email ? (
                        <span className="text-xs text-text-secondary flex items-center gap-1 truncate">
                          <Mail aria-hidden="true" className="h-3 w-3 shrink-0" />
                          {currentTenant.email as string}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {activeLease?.monthly_rent && (
                  <div className="text-end">
                    <p className="text-[12.5px] font-medium text-text-secondary">
                      {tt("monthlyRent")}
                    </p>
                    <p className="text-lg font-bold tabular-nums ltr-nums text-accent">
                      {formatMoney(activeLease.monthly_rent)}
                      <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                        {CURRENCY.code}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/api/tenants/${currentTenant.id}/unpaid-invoices/pdf`}
                  target="_blank"
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                  title={ti("downloadUnpaidPDFDescription")}
                >
                  <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
                  {ti("downloadUnpaidPDF")}
                </Link>
                {currentTenant.status === "active" && (
                  <Link
                    href={`/${locale}/tenants/${currentTenant.id}/relocate${activeLease?.id ? `?lease=${activeLease.id}` : ""}`}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    <ArrowRightLeft aria-hidden="true" className="h-3.5 w-3.5" />
                    {tt("relocate.button")}
                  </Link>
                )}
                {currentTenant.status === "active" && (
                  <Link
                    href={`/${locale}/tenants/${currentTenant.id}/renew-lease`}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    {tl("renewLease")}
                  </Link>
                )}
                <Link
                  href={`/${locale}/tenants/${currentTenant.id}/move-out${activeLease?.id ? `?lease=${activeLease.id}` : ""}`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
                  {tt("moveOutButton")}
                </Link>
              </div>
            </div>

            {/* Tenant details grid */}
            <div className="p-5">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
                {[
                  {
                    label: tt("nationality"),
                    value: currentTenant.nationality as string,
                    icon: Globe,
                  },
                  {
                    label: tt("nationalId"),
                    value: currentTenant.national_id as string,
                    icon: Shield,
                    mono: true,
                  },
                  {
                    label: tt("emergencyContact"),
                    value: currentTenant.emergency_contact as string,
                    icon: Phone,
                    mono: true,
                  },
                  {
                    label: tt("languagePreference"),
                    value:
                      (currentTenant.language_preference as string)?.toUpperCase() ||
                      "—",
                    icon: Globe,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="min-w-0">
                      <dt className="flex items-center gap-1 text-[12.5px] font-medium text-text-secondary">
                        <Icon
                          aria-hidden="true"
                          className="h-3 w-3 text-text-tertiary"
                        />
                        {item.label}
                      </dt>
                      <dd
                        className={`mt-1 text-sm text-text-primary truncate ${item.mono ? "tabular-nums ltr-nums" : ""}`}
                      >
                        {item.value || "—"}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              {/* Lease info */}
              {activeLease && (
                <dl className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
                  {[
                    {
                      label: tt("startDate"),
                      value: new Date(
                        activeLease.start_date
                      ).toLocaleDateString(),
                      icon: Calendar,
                    },
                    {
                      label: tt("endDate"),
                      value: new Date(
                        activeLease.end_date
                      ).toLocaleDateString(),
                      icon: Calendar,
                    },
                    {
                      label: tt("securityDeposit"),
                      value: activeLease.security_deposit
                        ? `${activeLease.security_deposit} ${CURRENCY.code}`
                        : "—",
                      icon: Shield,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="min-w-0">
                        <dt className="flex items-center gap-1 text-[12.5px] font-medium text-text-secondary">
                          <Icon
                            aria-hidden="true"
                            className="h-3 w-3 text-text-tertiary"
                          />
                          {item.label}
                        </dt>
                        <dd className="mt-1 text-sm text-text-primary tabular-nums ltr-nums truncate">
                          {item.value}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<User className="h-5 w-5" />}
            title={t("noTenant")}
            action={
              <Link
                href={`/${locale}/tenants/new?unitId=${unitId}&propertyId=${propertyId}&rentAmount=${unit.rent_amount || ""}`}
                className={buttonVariants({ size: "sm" })}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t("assignTenant")}
              </Link>
            }
          />
        )}
      </section>

      {/* Municipality-registered rent contract */}
      {currentTenant && activeLease && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <SectionHeading icon={Landmark} title={tmc("title")} className="mb-0" />
            <MunicipalityContractDialog unitId={unitId} />
          </div>
          <div className="bg-surface border border-border rounded-xl shadow-card p-5 flex flex-wrap items-start justify-between gap-4">
            {municipalityContract ? (
              <>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={municipalityContractExpired ? "warning" : "success"}>
                      {tmc(municipalityContractExpired ? "expiredBadge" : "active")}
                    </Badge>
                    <span className="text-sm font-semibold text-text-primary tabular-nums ltr-nums">
                      {municipalityContract.contract_number}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary tabular-nums ltr-nums">
                    {tmc("period", {
                      start: new Date(municipalityContract.start_date).toLocaleDateString(),
                      end: new Date(municipalityContract.end_date).toLocaleDateString(),
                    })}
                  </p>
                </div>
                {municipalityContractUrl && (
                  <a
                    href={municipalityContractUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ size: "sm" })}
                  >
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                    {tmc("view")}
                  </a>
                )}
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-warning">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                {tmc("none")}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Building rules agreement + violations */}
      {currentTenant && activeLease && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <SectionHeading icon={FileSignature} title={ta("staff.title")} className="mb-0" />
            <RecordViolationDialog
              unitId={unitId}
              garbageFee={Number(agreement?.garbage_fee ?? GARBAGE_VIOLATION_FEE)}
              keyFee={Number(agreement?.key_fee ?? LOST_KEY_FEE)}
            />
          </div>
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
            <div className="p-5 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={AGREEMENT_STATE_VARIANTS[agreementState]}>
                    {ta(`staff.states.${agreementState}`)}
                  </Badge>
                  {agreement && (
                    <span className="text-xs text-text-secondary tabular-nums ltr-nums">{agreement.reference}</span>
                  )}
                </div>
                <p className="text-sm text-text-secondary">
                  {agreementState === "signed" && agreement?.signed_at
                    ? ta("staff.signedOn", {
                        name: agreement.signer_name ?? "",
                        date: new Date(agreement.signed_at).toLocaleDateString(),
                      })
                    : agreementState === "pending" && agreement?.last_sent_at
                      ? ta("staff.sentOn", {
                          date: new Date(agreement.last_sent_at).toLocaleDateString(),
                          reminders: agreement.reminder_count,
                        })
                      : agreementState === "failed"
                        ? ta("staff.failed", { error: agreement?.last_send_error ?? "" })
                        : ta("staff.notSent")}
                </p>
              </div>
              <AgreementActions
                leaseId={activeLease.id as string}
                status={agreementState === "signed" ? "signed" : agreement?.sent_at ? "pending" : "none"}
                signingUrl={agreement ? `/${currentTenant.language_preference === "ar" ? "ar" : "en"}/tenant-agreement/${agreement.token}` : null}
              />
            </div>

            {violations.length > 0 && (
              <div className="border-t border-border">
                <h3 className="px-5 pt-4 pb-2 text-xs font-semibold text-text-secondary uppercase tracking-[0.06em] rtl:normal-case rtl:tracking-normal flex items-center gap-1.5">
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-destructive" />
                  {ta("violations.title")}
                </h3>
                <ul className="divide-y divide-border/40">
                  {violations.map((v) => (
                    <li key={v.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-text-primary">
                          {ta(`violations.list.${v.kind}`, { count: v.quantity })}
                          {v.tenant_id !== tenantId && (
                            <span className="ms-2 text-xs text-text-secondary">({ta("violations.previousTenant")})</span>
                          )}
                        </p>
                        <p className="text-xs text-text-secondary">
                          <span className="tabular-nums ltr-nums">{new Date(v.occurred_on).toLocaleDateString()}</span>
                          {v.invoices?.invoice_number && (
                            <span className="tabular-nums ltr-nums"> · {v.invoices.invoice_number}</span>
                          )}
                          {v.notes ? ` · ${v.notes}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.invoices?.status && (
                          <Badge variant={INVOICE_STATUS_VARIANTS[v.invoices.status] ?? "secondary"} className="text-xs px-1.5">
                            {["pending", "overdue", "partial", "paid", "cancelled", "written_off"].includes(v.invoices.status)
                              ? ti(v.invoices.status)
                              : v.invoices.status}
                          </Badge>
                        )}
                        <span className="text-sm font-semibold tabular-nums ltr-nums tabular-nums text-destructive">
                          {formatAmount(Number(v.amount))} {CURRENCY.code}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Previous Tenants */}
      {pastLeases && pastLeases.length > 0 && (
        <section>
          <SectionHeading
            icon={Clock}
            title={t("previousTenants")}
            count={pastLeases.length}
          />
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{tt("fullName")}</TableHead>
                    <TableHead className="px-4">{tt("phone")}</TableHead>
                    <TableHead className="px-4">{tt("startDate")}</TableHead>
                    <TableHead className="px-4">{tt("endDate")}</TableHead>
                    <TableHead className="px-4">{t("vacateDate")}</TableHead>
                    <TableHead className="px-4">{t("vacateReason")}</TableHead>
                    <TableHead className="w-12 px-4 text-end">
                      <span className="sr-only">{tc("actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastLeases.map((lease: Record<string, unknown>) => {
                    const pastTenant = lease.tenants as Record<string, unknown> | null;
                    return (
                      <TableRow key={lease.id as string}>
                        <TableCell className="px-4">
                          {pastTenant ? (
                            <Link
                              href={`/${locale}/tenants/${pastTenant.id}`}
                              className="text-sm font-medium text-text-primary hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                            >
                              {pastTenant.full_name as string}
                            </Link>
                          ) : (
                            <span className="text-sm text-text-secondary">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary tabular-nums ltr-nums">
                          {(pastTenant?.phone as string) || "—"}
                        </TableCell>
                        <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                          {new Date(lease.start_date as string).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                          {new Date(lease.end_date as string).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                          {lease.vacate_date
                            ? new Date(lease.vacate_date as string).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary">
                          {lease.vacate_reason
                            ? tt(`reasons.${lease.vacate_reason}`)
                            : "—"}
                        </TableCell>
                        <TableCell className="px-4 text-end">
                          {pastTenant ? (
                            <Link
                              href={`/api/tenants/${pastTenant.id}/unpaid-invoices/pdf`}
                              target="_blank"
                              className="inline-flex items-center gap-1 p-1.5 text-text-secondary hover:text-accent rounded-md border border-border hover:border-border-strong transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                              title={ti("downloadUnpaidPDFDescription")}
                              aria-label={ti("downloadUnpaidPDF")}
                            >
                              <FileDown aria-hidden="true" className="h-3 w-3" />
                            </Link>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-border">
              {pastLeases.map((lease: Record<string, unknown>) => {
                const pastTenant = lease.tenants as Record<string, unknown> | null;
                return (
                  <li key={`m-${lease.id as string}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {pastTenant ? (
                          <Link
                            href={`/${locale}/tenants/${pastTenant.id}`}
                            className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
                          >
                            {pastTenant.full_name as string}
                          </Link>
                        ) : (
                          <p className="text-sm text-text-secondary">—</p>
                        )}
                        {pastTenant?.phone ? (
                          <p className="text-xs text-text-secondary tabular-nums ltr-nums mt-0.5">
                            {pastTenant.phone as string}
                          </p>
                        ) : null}
                      </div>
                      {pastTenant ? (
                        <Link
                          href={`/api/tenants/${pastTenant.id}/unpaid-invoices/pdf`}
                          target="_blank"
                          className="inline-flex items-center gap-1 p-2 text-text-secondary hover:text-accent rounded-md border border-border hover:border-border-strong transition-colors shrink-0"
                          title={ti("downloadUnpaidPDFDescription")}
                          aria-label={ti("downloadUnpaidPDF")}
                        >
                          <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-text-secondary">
                      <span className="tabular-nums ltr-nums">
                        {new Date(lease.start_date as string).toLocaleDateString()}
                      </span>
                      {" — "}
                      <span className="tabular-nums ltr-nums">
                        {lease.vacate_date
                          ? new Date(lease.vacate_date as string).toLocaleDateString()
                          : new Date(lease.end_date as string).toLocaleDateString()}
                      </span>
                      {lease.vacate_reason
                        ? ` · ${tt(`reasons.${lease.vacate_reason}`)}`
                        : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Invoices for the current lease */}
      {currentTenant && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <SectionHeading
              icon={Receipt}
              title={ti("title")}
              count={invoices?.length}
              className="mb-0"
            />
            <Link
              href={`/${locale}/invoices`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              {tc("viewAll")}
            </Link>
          </div>

          {invoices && invoices.length > 0 ? (
            <>
              {/* Paid / Pending summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bg-surface border border-success/30 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-success" />
                    <span className="text-[12.5px] font-medium text-text-secondary">
                      {ti("paid")}
                    </span>
                    <span className="ms-auto text-xs font-medium text-text-secondary bg-surface-elevated border border-border px-2 py-0.5 rounded-md tabular-nums ltr-nums">
                      {invoiceTotals.paidCount}
                    </span>
                  </div>
                  <p className="text-lg font-bold tabular-nums ltr-nums text-success">
                    {formatAmount(invoiceTotals.paidAmount)}
                    <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                      {CURRENCY.code}
                    </span>
                  </p>
                </div>
                <div className="bg-surface border border-warning/30 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5 text-warning" />
                    <span className="text-[12.5px] font-medium text-text-secondary">
                      {ti("pending")}
                    </span>
                    <span className="ms-auto text-xs font-medium text-text-secondary bg-surface-elevated border border-border px-2 py-0.5 rounded-md tabular-nums ltr-nums">
                      {invoiceTotals.pendingCount}
                    </span>
                  </div>
                  <p className="text-lg font-bold tabular-nums ltr-nums text-warning">
                    {formatAmount(invoiceTotals.pendingAmount)}
                    <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                      {CURRENCY.code}
                    </span>
                  </p>
                </div>
              </div>

              {/* Invoice table */}
              <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table className="min-w-[820px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="px-4">{ti("dueDate")}</TableHead>
                        <TableHead className="px-4">
                          {ti("periodStart")} — {ti("periodEnd")}
                        </TableHead>
                        <TableHead className="px-4 text-end">{ti("amount")}</TableHead>
                        <TableHead className="px-4 text-end">{ti("paidAmount")}</TableHead>
                        <TableHead className="px-4 text-end">{ti("remaining")}</TableHead>
                        <TableHead className="px-4">{ti("status")}</TableHead>
                        <TableHead className="px-4 text-end">
                          <span className="sr-only">{ti("actions")}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => {
                        const amount = Number(inv.amount) || 0;
                        const paid = Number(inv.paid_amount) || 0;
                        const remaining = Math.max(0, amount - paid);
                        return (
                          <TableRow
                            key={inv.id}
                            className={
                              inv.status === "overdue" ? "bg-destructive-tint" : ""
                            }
                          >
                            <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                              {new Date(inv.due_date).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="px-4 text-text-secondary tabular-nums ltr-nums">
                              {inv.period_start
                                ? new Date(inv.period_start).toLocaleDateString()
                                : "—"}
                              {" — "}
                              {inv.period_end
                                ? new Date(inv.period_end).toLocaleDateString()
                                : "—"}
                            </TableCell>
                            <TableCell className="px-4 text-end font-semibold text-text-primary tabular-nums ltr-nums">
                              {formatAmount(amount)}{" "}
                              <span className="text-xs font-medium text-text-secondary">
                                {CURRENCY.code}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 text-end text-success tabular-nums ltr-nums">
                              {formatAmount(paid)}
                            </TableCell>
                            <TableCell
                              className={`px-4 text-end tabular-nums ltr-nums ${
                                remaining > 0
                                  ? "text-warning font-semibold"
                                  : "text-text-secondary"
                              }`}
                            >
                              {formatAmount(remaining)}
                            </TableCell>
                            <TableCell className="px-4">
                              <Badge
                                variant={
                                  INVOICE_STATUS_VARIANTS[inv.status] ?? "secondary"
                                }
                                className="capitalize"
                              >
                                {ti(inv.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4">
                              <InvoiceRowActions inv={inv} tenantName={invoiceTenantName} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {/* Mobile card list */}
                <ul className="md:hidden divide-y divide-border">
                  {invoices.map((inv) => {
                    const amount = Number(inv.amount) || 0;
                    const paid = Number(inv.paid_amount) || 0;
                    const remaining = Math.max(0, amount - paid);
                    return (
                      <li
                        key={`m-${inv.id}`}
                        className={`p-4 ${
                          inv.status === "overdue" ? "bg-destructive-tint" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text-primary tabular-nums ltr-nums">
                              {new Date(inv.due_date).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-text-secondary tabular-nums ltr-nums mt-0.5">
                              {inv.period_start
                                ? new Date(inv.period_start).toLocaleDateString()
                                : "—"}
                              {" — "}
                              {inv.period_end
                                ? new Date(inv.period_end).toLocaleDateString()
                                : "—"}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-text-primary tabular-nums ltr-nums text-end shrink-0">
                            {formatAmount(amount)}{" "}
                            <span className="text-xs font-normal text-text-secondary">
                              {CURRENCY.code}
                            </span>
                          </p>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              INVOICE_STATUS_VARIANTS[inv.status] ?? "secondary"
                            }
                            className="capitalize text-xs px-1.5"
                          >
                            {ti(inv.status)}
                          </Badge>
                          {remaining > 0 && (
                            <span className="text-xs text-text-secondary">
                              {ti("remaining")} ·{" "}
                              <span className="tabular-nums ltr-nums font-semibold text-warning">
                                {formatAmount(remaining)}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="mt-3">
                          <InvoiceRowActions inv={inv} tenantName={invoiceTenantName} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title={ti("noInvoices")}
              description={ti("noInvoicesDescription")}
            />
          )}
        </section>
      )}

      {/* Payment History */}
      <section>
        <SectionHeading
          icon={CreditCard}
          title={t("paymentHistory")}
          count={payments?.length}
        />

        {payments && payments.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{tt("paymentDate")}</TableHead>
                    <TableHead className="px-4 text-end">{tt("amount")}</TableHead>
                    <TableHead className="px-4">{tt("paymentMethod")}</TableHead>
                    <TableHead className="px-4">{tt("reference")}</TableHead>
                    <TableHead className="px-4">{tt("notes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment: Record<string, unknown>) => (
                    <TableRow key={payment.id as string}>
                      <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                        {new Date(
                          payment.payment_date as string
                        ).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="px-4 text-end font-semibold text-text-primary tabular-nums ltr-nums">
                        {formatMoney(payment.amount)}{" "}
                        <span className="text-xs font-medium text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </TableCell>
                      <TableCell className="px-4">
                        <EditPaymentMethod
                          paymentId={payment.id as string}
                          currentMethod={
                            (payment.method as
                              | "cash"
                              | "bank_transfer"
                              | "cheque"
                              | "direct_debit"
                              | null) ?? null
                          }
                        />
                      </TableCell>
                      <TableCell className="px-4">
                        {payment.method === "cheque" && payment.reference_number ? (
                          <a
                            href="#cheques-section"
                            className="text-sm text-accent tabular-nums ltr-nums font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                          >
                            {payment.reference_number as string}
                          </a>
                        ) : (
                          <span className="text-sm text-text-secondary tabular-nums ltr-nums">
                            {(payment.reference_number as string) || "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 text-text-secondary">
                        {(payment.notes as string) || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-border">
              {payments.map((payment: Record<string, unknown>) => (
                <li key={`m-${payment.id as string}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-text-secondary tabular-nums ltr-nums">
                      {new Date(
                        payment.payment_date as string
                      ).toLocaleDateString()}
                    </p>
                    <p className="text-sm font-semibold text-text-primary tabular-nums ltr-nums text-end shrink-0">
                      {formatMoney(payment.amount)}{" "}
                      <span className="text-xs font-normal text-text-secondary">
                        {CURRENCY.code}
                      </span>
                    </p>
                  </div>
                  <div className="mt-2">
                    <EditPaymentMethod
                      paymentId={payment.id as string}
                      currentMethod={
                        (payment.method as
                          | "cash"
                          | "bank_transfer"
                          | "cheque"
                          | "direct_debit"
                          | null) ?? null
                      }
                    />
                  </div>
                  {Boolean(payment.reference_number) && (
                    <p className="mt-1.5 text-xs text-text-secondary truncate">
                      {tt("reference")} ·{" "}
                      <span className="tabular-nums ltr-nums">
                        {payment.reference_number as string}
                      </span>
                    </p>
                  )}
                  {Boolean(payment.notes) && (
                    <p className="mt-1 text-xs text-text-secondary truncate">
                      {payment.notes as string}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon={<CreditCard className="h-5 w-5" />}
            title={tt("noPayments")}
          />
        )}
      </section>

      {/* Cheques */}
      <section id="cheques-section">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <SectionHeading
            icon={FileText}
            title={tch("title")}
            count={cheques?.length}
            className="mb-0"
          />
          {tenantId && <AddChequeDialog tenantId={tenantId} />}
        </div>

        {cheques && cheques.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{tch("chequeNumber")}</TableHead>
                    <TableHead className="px-4">{tch("bankName")}</TableHead>
                    <TableHead className="px-4">{tch("chequeDate")}</TableHead>
                    <TableHead className="px-4 text-end">{tch("amount")}</TableHead>
                    <TableHead className="px-4">{tch("status")}</TableHead>
                    <TableHead className="w-12 px-4 text-end">
                      <span className="sr-only">{tc("actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cheques.map((cheque: Record<string, unknown>) => (
                    <TableRow
                      key={cheque.id as string}
                      className={
                        (cheque.status as string) === "bounced"
                          ? "bg-destructive-tint"
                          : ""
                      }
                    >
                      <TableCell className="px-4 font-medium text-text-primary tabular-nums ltr-nums">
                        #{cheque.cheque_number as string}
                      </TableCell>
                      <TableCell className="px-4 text-text-secondary">
                        {cheque.bank_name as string}
                      </TableCell>
                      <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                        {new Date(
                          cheque.cheque_date as string
                        ).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="px-4 text-end font-semibold text-text-primary tabular-nums ltr-nums">
                        {formatMoney(cheque.amount)}{" "}
                        <span className="text-xs font-medium text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </TableCell>
                      <TableCell className="px-4">
                        <Badge
                          variant={
                            CHEQUE_STATUS_VARIANTS[cheque.status as string] ??
                            "secondary"
                          }
                        >
                          {chequeStatusLabel(cheque.status as string)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 text-end">
                        <ChequeActions
                          chequeId={cheque.id as string}
                          currentStatus={cheque.status as string}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-border">
              {cheques.map((cheque: Record<string, unknown>) => (
                <li
                  key={`m-${cheque.id as string}`}
                  className={`p-4 ${
                    (cheque.status as string) === "bounced"
                      ? "bg-destructive-tint"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary tabular-nums ltr-nums truncate">
                        #{cheque.cheque_number as string}
                      </p>
                      <p className="text-xs text-text-secondary truncate mt-0.5">
                        {cheque.bank_name as string}
                        {" · "}
                        <span className="tabular-nums ltr-nums">
                          {new Date(
                            cheque.cheque_date as string
                          ).toLocaleDateString()}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <p className="text-sm font-semibold text-text-primary tabular-nums ltr-nums text-end">
                        {formatMoney(cheque.amount)}{" "}
                        <span className="text-xs font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </p>
                      <ChequeActions
                        chequeId={cheque.id as string}
                        currentStatus={cheque.status as string}
                      />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <Badge
                      variant={
                        CHEQUE_STATUS_VARIANTS[cheque.status as string] ??
                        "secondary"
                      }
                    >
                      {chequeStatusLabel(cheque.status as string)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={tch("noCheques")}
            description={tch("noChequesDescription")}
            action={tenantId ? <AddChequeDialog tenantId={tenantId} /> : undefined}
          />
        )}
      </section>

      {/* Documents */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <SectionHeading
            icon={Folder}
            title={td("title")}
            count={documents?.length}
            className="mb-0"
          />
          {tenantId && (
            <Link
              href={`/${locale}/documents/upload?entityType=tenant&entityId=${tenantId}`}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              {td("uploadDocument")}
            </Link>
          )}
        </div>

        {documents && documents.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{td("fileName")}</TableHead>
                    <TableHead className="px-4">{td("documentType")}</TableHead>
                    <TableHead className="px-4">{td("expiryDate")}</TableHead>
                    <TableHead className="px-4">{td("uploadDate")}</TableHead>
                    <TableHead className="w-12 px-4 text-end">
                      <span className="sr-only">{tc("actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
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
                      <TableRow key={doc.id as string}>
                        <TableCell className="px-4 font-medium text-text-primary">
                          {(doc.file_name as string) || "—"}
                        </TableCell>
                        <TableCell className="px-4">
                          <Badge variant="default" className="capitalize">
                            {((doc.document_type as string) || "").replace(
                              /_/g,
                              " "
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-sm tabular-nums ltr-nums ${
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
                              <Badge variant="destructive" className="text-xs px-1.5">
                                {td("expired")}
                              </Badge>
                            )}
                            {isExpiringSoon && !isExpired && (
                              <Badge variant="warning" className="text-xs px-1.5">
                                {td("expiringSoon")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary tabular-nums ltr-nums">
                          {new Date(
                            doc.uploaded_at as string
                          ).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4 text-end">
                          {Boolean(doc.file_url) && docUrlMap.get(doc.file_url as string) ? (
                            <a
                              href={docUrlMap.get(doc.file_url as string)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={td("preview")}
                              className="p-1.5 rounded-lg text-accent hover:bg-accent-tint transition-colors inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            >
                              <ExternalLink aria-hidden="true" className="h-4 w-4" />
                            </a>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-border">
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
                  <li key={`m-${doc.id as string}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {(doc.file_name as string) || "—"}
                        </p>
                        <p className="text-xs text-text-secondary tabular-nums ltr-nums mt-0.5">
                          {new Date(
                            doc.uploaded_at as string
                          ).toLocaleDateString()}
                        </p>
                      </div>
                      {Boolean(doc.file_url) && docUrlMap.get(doc.file_url as string) ? (
                        <a
                          href={docUrlMap.get(doc.file_url as string)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={td("preview")}
                          className="p-2 -m-0.5 rounded-lg text-accent hover:bg-accent-tint transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          <ExternalLink aria-hidden="true" className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="default" className="capitalize text-xs px-1.5">
                        {((doc.document_type as string) || "").replace(/_/g, " ")}
                      </Badge>
                      {isExpired && (
                        <Badge variant="destructive" className="text-xs px-1.5">
                          {td("expired")}
                        </Badge>
                      )}
                      {isExpiringSoon && !isExpired && (
                        <Badge variant="warning" className="text-xs px-1.5">
                          {td("expiringSoon")}
                        </Badge>
                      )}
                      {expiryDate && (
                        <span className="text-xs text-text-secondary tabular-nums ltr-nums">
                          {expiryDate.toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon={<Folder className="h-5 w-5" />}
            title={tt("noDocuments")}
            description={td("noDocumentsDescription")}
            action={
              tenantId ? (
                <Link
                  href={`/${locale}/documents/upload?entityType=tenant&entityId=${tenantId}`}
                  className={buttonVariants({ size: "sm" })}
                >
                  <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                  {td("uploadDocument")}
                </Link>
              ) : undefined
            }
          />
        )}
      </section>

      {/* Maintenance */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <SectionHeading
            icon={Wrench}
            title={tt("maintenance")}
            count={maintenance?.length}
            className="mb-0"
          />
          <Link
            href={`/${locale}/maintenance/new?unitId=${unitId}&propertyId=${propertyId}`}
            className={buttonVariants({ size: "sm" })}
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {tm("newRequest")}
          </Link>
        </div>

        {maintenance && maintenance.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{tt("maintenanceDate")}</TableHead>
                    <TableHead className="px-4">{tt("maintenanceTitle")}</TableHead>
                    <TableHead className="px-4">{tt("maintenancePriority")}</TableHead>
                    <TableHead className="px-4">{tt("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenance.map((req: Record<string, unknown>) => (
                    <TableRow key={req.id as string}>
                      <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                        <Link
                          href={`/${locale}/maintenance/${req.id}`}
                          className="hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                        >
                          {new Date(
                            req.created_at as string
                          ).toLocaleDateString()}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4">
                        <Link
                          href={`/${locale}/maintenance/${req.id}`}
                          className="text-sm font-medium text-text-primary hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                        >
                          {(req.description as string)?.slice(0, 60) || "—"}
                          {(req.description as string)?.length > 60 ? "…" : ""}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4">
                        <Badge
                          variant={
                            URGENCY_VARIANTS[(req.urgency as string) || "medium"] ??
                            "secondary"
                          }
                          className="capitalize"
                        >
                          {req.urgency ? tm(`urgencies.${req.urgency}`) : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4">
                        <Badge
                          variant={
                            MAINTENANCE_STATUS_VARIANTS[
                              (req.status as string) || "open"
                            ] ?? "secondary"
                          }
                          className="capitalize"
                        >
                          {req.status ? tm(`statuses.${req.status}`) : ""}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-border">
              {maintenance.map((req: Record<string, unknown>) => (
                <li key={`m-${req.id as string}`}>
                  <Link
                    href={`/${locale}/maintenance/${req.id}`}
                    className="block p-4 hover:bg-surface-elevated transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <p className="text-sm font-medium text-text-primary leading-snug">
                      {(req.description as string)?.slice(0, 60) || "—"}
                      {(req.description as string)?.length > 60 ? "…" : ""}
                    </p>
                    <p className="text-xs text-text-secondary tabular-nums ltr-nums mt-1">
                      {new Date(req.created_at as string).toLocaleDateString()}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          URGENCY_VARIANTS[(req.urgency as string) || "medium"] ??
                          "secondary"
                        }
                        className="capitalize text-xs px-1.5"
                      >
                        {req.urgency ? tm(`urgencies.${req.urgency}`) : "—"}
                      </Badge>
                      <Badge
                        variant={
                          MAINTENANCE_STATUS_VARIANTS[
                            (req.status as string) || "open"
                          ] ?? "secondary"
                        }
                        className="capitalize text-xs px-1.5"
                      >
                        {req.status ? tm(`statuses.${req.status}`) : ""}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon={<Wrench className="h-5 w-5" />}
            title={tt("noMaintenance")}
            description={tm("noRequestsDescription")}
            action={
              <Link
                href={`/${locale}/maintenance/new?unitId=${unitId}&propertyId=${propertyId}`}
                className={buttonVariants({ size: "sm" })}
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                {tm("newRequest")}
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}

/* ------------------------- Section heading helper ------------------------- */

function SectionHeading({
  icon: Icon,
  title,
  count,
  className,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? "mb-4"}`}>
      <div className="p-1.5 rounded-lg bg-accent-tint border border-accent/30">
        <Icon aria-hidden className="h-4 w-4 text-accent" />
      </div>
      <h2 className="text-base font-semibold text-text-primary font-display">
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className="text-xs font-medium text-text-secondary bg-surface-elevated border border-border px-2 py-0.5 rounded-md tabular-nums ltr-nums">
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * Per-invoice actions on the unit page — the same set the Invoices page
 * offers: edit, undo a payment, cancel, and record a payment.
 */
function InvoiceRowActions({
  inv,
  tenantName,
}: {
  inv: {
    id: string;
    tenant_id: string;
    amount: number | string;
    paid_amount: number | string | null;
    due_date: string;
    period_start: string | null;
    period_end: string | null;
    status: "pending" | "overdue" | "partial" | "paid";
  };
  tenantName: string;
}) {
  const amount = String(inv.amount);
  const paidAmount = String(inv.paid_amount || 0);
  return (
    <div className="flex items-center justify-end gap-2">
      <EditInvoiceButton invoiceId={inv.id} tenantName={tenantName} />
      {(inv.status === "paid" || inv.status === "partial") && (
        <RevertPaidButton
          invoiceId={inv.id}
          amount={amount}
          paidAmount={paidAmount}
          tenantName={tenantName}
        />
      )}
      <CancelInvoiceButton
        invoiceId={inv.id}
        amount={amount}
        paidAmount={paidAmount}
        tenantName={tenantName}
      />
      {inv.status !== "paid" && (
        <MarkPaidButton
          invoiceId={inv.id}
          amount={amount}
          paidAmount={paidAmount}
          tenantName={tenantName}
          tenantId={inv.tenant_id}
          periodStart={inv.period_start || undefined}
          periodEnd={inv.period_end || undefined}
          dueDate={inv.due_date || undefined}
        />
      )}
    </div>
  );
}
