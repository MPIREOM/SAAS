import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { getDocumentUrls } from "@/lib/utils/document-url";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { SharePortalButton } from "@/components/tenants/share-portal-button";
import { EditPaymentMethod } from "@/components/payments/edit-payment-method";
import {
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
  CheckCircle2,
  XCircle,
  Calendar,
  Banknote,
  Shield,
  RefreshCw,
  ScrollText,
  FileDown,
} from "lucide-react";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
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

type BadgeVariant =
  | "default"
  | "secondary"
  | "warning"
  | "destructive"
  | "success";

const CHEQUE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  cleared: "success",
  pending: "warning",
  bounced: "destructive",
};

const DEPOSIT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  refunded: "success",
  pending: "warning",
  deducted: "destructive",
};

const MAINTENANCE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  open: "warning",
  in_progress: "default",
  resolved: "success",
  closed: "secondary",
};

const URGENCY_VARIANTS: Record<string, BadgeVariant> = {
  emergency: "destructive",
  high: "warning",
  medium: "default",
  low: "secondary",
};

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
  const tl = await getTranslations("leases");
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

  const chequeStatusLabel = (status: string) =>
    ["pending", "cleared", "bounced", "cancelled"].includes(status)
      ? tch(`statuses.${status}`)
      : status;

  const formatMoney = (value: unknown) =>
    Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-8">
      <PageHeader
        title={tenant.full_name}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/tenants` },
          { label: tenant.full_name },
        ]}
      >
        <Link
          href={`/${locale}/tenants/${id}/edit`}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" />
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
          className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm font-medium rounded-xl hover:border-accent/30 hover:text-accent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <ScrollText aria-hidden="true" className="h-4 w-4" />
          {t("statement")}
        </Link>
        <Link
          href={`/api/tenants/${id}/unpaid-invoices/pdf`}
          target="_blank"
          className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm font-medium rounded-xl hover:border-accent/30 hover:text-accent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          title={ti("downloadUnpaidPDFDescription")}
        >
          <FileDown aria-hidden="true" className="h-4 w-4" />
          {ti("downloadUnpaidPDF")}
        </Link>
        {tenant.status === "active" && (
          <>
            <Link
              href={`/${locale}/tenants/${id}/renew-lease`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm font-medium rounded-xl hover:border-accent/30 hover:text-accent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              {tl("renewLease")}
            </Link>
            <Link
              href={`/${locale}/tenants/${id}/move-out`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm font-medium rounded-xl hover:bg-border/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {t("moveOut")}
            </Link>
          </>
        )}
      </PageHeader>

      {/* Identity card */}
      <section className="bg-surface border border-border/60 rounded-xl overflow-hidden animate-fade-in-up">
        <div className="p-5 bg-gradient-to-r from-accent/5 to-transparent border-b border-border/40">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
              <User aria-hidden="true" className="h-6 w-6 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-text-primary font-display truncate">
                {tenant.full_name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge
                  variant={tenant.status === "archived" ? "secondary" : "success"}
                >
                  {t(tenant.status || "active")}
                </Badge>
                <span className="text-[11px] text-text-secondary">
                  {t("tenantId")}:{" "}
                  <span className="font-mono ltr-nums">{tenant.id}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <dl className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-5">
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Phone aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("phone")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums truncate">
              {tenant.phone || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Mail aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("email")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary truncate">
              {tenant.email || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Globe aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("nationality")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary truncate">
              {tenant.nationality || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Shield aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("nationalId")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums truncate">
              {tenant.national_id || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Phone aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("emergencyContact")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary truncate">
              {tenant.emergency_contact || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <Globe aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
              {t("languagePreference")}
            </dt>
            <dd className="mt-1 text-sm text-text-primary truncate">
              {tenant.language_preference === "ar"
                ? t("languages.ar")
                : t("languages.en")}
            </dd>
          </div>
        </dl>
      </section>

      {/* Move-out Summary (archived tenants only) */}
      {tenant.status === "archived" && moveOutLease && (
        <section className="bg-surface border border-destructive/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-1.5 rounded-lg bg-destructive/10 border border-destructive/15">
              <LogOut aria-hidden="true" className="h-4 w-4 text-destructive" />
            </div>
            <h2 className="text-base font-semibold text-text-primary font-display">
              {t("moveOutSummary")}
            </h2>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-5">
            <div>
              <dt className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                <Calendar aria-hidden="true" className="h-3 w-3 text-text-secondary/70" />
                {t("vacateDate")}
              </dt>
              <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums">
                {moveOutLease.vacate_date
                  ? new Date(
                      moveOutLease.vacate_date as string
                    ).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                {t("vacateReason")}
              </dt>
              <dd className="mt-1 text-sm text-text-primary">
                {moveOutLease.vacate_reason
                  ? t(`reasons.${moveOutLease.vacate_reason}`)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                {t("depositStatus")}
              </dt>
              <dd className="mt-1">
                {moveOutLease.deposit_status ? (
                  <Badge
                    variant={
                      DEPOSIT_STATUS_VARIANTS[
                        moveOutLease.deposit_status as string
                      ] ?? "secondary"
                    }
                  >
                    {t(`depositStatuses.${moveOutLease.deposit_status}`)}
                  </Badge>
                ) : (
                  <span className="text-sm text-text-primary">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                {t("finalInspection")}
              </dt>
              <dd className="mt-1 text-sm text-text-primary flex items-center gap-1.5">
                {moveOutLease.final_inspection ? (
                  <>
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
                    {tc("yes")}
                  </>
                ) : (
                  <>
                    <XCircle aria-hidden="true" className="h-4 w-4 text-destructive" />
                    {tc("no")}
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                {t("keysReturned")}
              </dt>
              <dd className="mt-1 text-sm text-text-primary flex items-center gap-1.5">
                {moveOutLease.keys_returned ? (
                  <>
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
                    {tc("yes")}
                  </>
                ) : (
                  <>
                    <XCircle aria-hidden="true" className="h-4 w-4 text-destructive" />
                    {tc("no")}
                  </>
                )}
              </dd>
            </div>
            {moveOutLease.vacate_notes && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                  {t("vacateNotes")}
                </dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {moveOutLease.vacate_notes as string}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* Lease Info Section */}
      <section>
        <SectionHeading icon={FileText} title={t("leaseInfo")} count={leases?.length} />
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
                  className="bg-surface border border-border/60 rounded-xl p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <Badge variant={lease.is_active ? "success" : "secondary"}>
                      {lease.is_active ? t("leaseActive") : t("leaseExpired")}
                    </Badge>
                    {Boolean(lease.is_active) && daysRemaining > 0 && (
                      <span className="text-xs text-text-secondary">
                        <span className="font-mono ltr-nums font-semibold text-text-primary">
                          {daysRemaining}
                        </span>{" "}
                        {t("daysRemaining")}
                      </span>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-5">
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        {t("property")}
                      </dt>
                      <dd className="mt-1 text-sm text-text-primary truncate">
                        {(property?.name as string) || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        {t("unit")}
                      </dt>
                      <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums truncate">
                        {(unit?.unit_number as string) || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        {t("startDate")}
                      </dt>
                      <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums">
                        {startDate.toLocaleDateString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        {t("endDate")}
                      </dt>
                      <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums">
                        {endDate.toLocaleDateString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        {t("monthlyRent")}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-text-primary font-mono ltr-nums">
                        {formatMoney(lease.monthly_rent)}{" "}
                        <span className="text-[10px] font-sans font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        {t("securityDeposit")}
                      </dt>
                      <dd className="mt-1 text-sm text-text-primary font-mono ltr-nums">
                        {formatMoney(lease.security_deposit)}{" "}
                        <span className="text-[10px] font-sans text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={t("noLeases")}
          />
        )}
      </section>

      {/* Payments Section */}
      <section>
        <SectionHeading icon={CreditCard} title={t("payments")} count={payments?.length} />
        {payments && payments.length > 0 ? (
          <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{t("paymentDate")}</TableHead>
                    <TableHead className="px-4 text-end">{t("amount")}</TableHead>
                    <TableHead className="px-4">{t("paymentMethod")}</TableHead>
                    <TableHead className="px-4">{t("reference")}</TableHead>
                    <TableHead className="px-4">{t("notes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment: Record<string, unknown>) => (
                    <TableRow key={payment.id as string}>
                      <TableCell className="px-4 text-text-primary font-mono ltr-nums">
                        {new Date(payment.payment_date as string).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="px-4 text-end font-semibold text-text-primary font-mono ltr-nums">
                        {formatMoney(payment.amount)}{" "}
                        <span className="text-[10px] font-sans font-normal text-text-secondary">
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
                              | null) ?? null
                          }
                        />
                      </TableCell>
                      <TableCell className="px-4">
                        {payment.method === "cheque" && payment.reference_number ? (
                          <a
                            href="#cheques-section"
                            className="text-sm text-accent font-mono ltr-nums font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                          >
                            {payment.reference_number as string}
                          </a>
                        ) : (
                          <span className="text-sm text-text-secondary font-mono ltr-nums">
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
            <ul className="md:hidden divide-y divide-border/40">
              {payments.map((payment: Record<string, unknown>) => (
                <li key={`m-${payment.id as string}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-text-secondary font-mono ltr-nums">
                      {new Date(payment.payment_date as string).toLocaleDateString()}
                    </p>
                    <p className="text-sm font-semibold text-text-primary font-mono ltr-nums text-end shrink-0">
                      {formatMoney(payment.amount)}{" "}
                      <span className="text-[10px] font-normal text-text-secondary">
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
                          | null) ?? null
                      }
                    />
                  </div>
                  {Boolean(payment.reference_number) && (
                    <p className="mt-1.5 text-xs text-text-secondary truncate">
                      {t("reference")} ·{" "}
                      <span className="font-mono ltr-nums">
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
            title={t("noPayments")}
          />
        )}
      </section>

      {/* Cheques Section */}
      <section id="cheques-section">
        <SectionHeading icon={Banknote} title={tch("title")} count={cheques?.length} />
        {cheques && cheques.length > 0 ? (
          <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{tch("chequeNumber")}</TableHead>
                    <TableHead className="px-4">{tch("bankName")}</TableHead>
                    <TableHead className="px-4">{tch("chequeDate")}</TableHead>
                    <TableHead className="px-4 text-end">{tch("amount")}</TableHead>
                    <TableHead className="px-4">{tch("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cheques.map((cheque: Record<string, unknown>) => (
                    <TableRow
                      key={cheque.id as string}
                      className={
                        (cheque.status as string) === "bounced"
                          ? "bg-destructive/5"
                          : ""
                      }
                    >
                      <TableCell className="px-4 font-medium text-text-primary font-mono ltr-nums">
                        #{cheque.cheque_number as string}
                      </TableCell>
                      <TableCell className="px-4 text-text-secondary">
                        {cheque.bank_name as string}
                      </TableCell>
                      <TableCell className="px-4 text-text-primary font-mono ltr-nums">
                        {new Date(
                          cheque.cheque_date as string
                        ).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="px-4 text-end font-semibold text-text-primary font-mono ltr-nums">
                        {formatMoney(cheque.amount)}{" "}
                        <span className="text-[10px] font-sans font-normal text-text-secondary">
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-border/40">
              {cheques.map((cheque: Record<string, unknown>) => (
                <li
                  key={`m-${cheque.id as string}`}
                  className={`p-4 ${
                    (cheque.status as string) === "bounced"
                      ? "bg-destructive/5"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary font-mono ltr-nums truncate">
                        #{cheque.cheque_number as string}
                      </p>
                      <p className="text-xs text-text-secondary truncate mt-0.5">
                        {cheque.bank_name as string}
                        {" · "}
                        <span className="font-mono ltr-nums">
                          {new Date(
                            cheque.cheque_date as string
                          ).toLocaleDateString()}
                        </span>
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-text-primary font-mono ltr-nums text-end shrink-0">
                      {formatMoney(cheque.amount)}{" "}
                      <span className="text-[10px] font-normal text-text-secondary">
                        {CURRENCY.code}
                      </span>
                    </p>
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
            icon={<Banknote className="h-5 w-5" />}
            title={tch("noCheques")}
          />
        )}
      </section>

      {/* Documents Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <SectionHeading
            icon={Folder}
            title={td("title")}
            count={documents?.length}
            className="mb-0"
          />
          <Link
            href={`/${locale}/documents/upload?entity_type=tenant&entity_id=${id}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-accent/10 text-accent text-xs font-semibold rounded-lg hover:bg-accent/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
            {td("upload")}
          </Link>
        </div>
        {documents && documents.length > 0 ? (
          <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
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
                              <Badge variant="destructive" className="text-[10px] px-1.5">
                                {td("expired")}
                              </Badge>
                            )}
                            {isExpiringSoon && !isExpired && (
                              <Badge variant="warning" className="text-[10px] px-1.5">
                                {td("expiringSoon")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary font-mono ltr-nums">
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
                              className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
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
            <ul className="md:hidden divide-y divide-border/40">
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
                        <p className="text-xs text-text-secondary font-mono ltr-nums mt-0.5">
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
                          className="p-2 -m-0.5 rounded-lg text-accent hover:bg-accent/10 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          <ExternalLink aria-hidden="true" className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="default" className="capitalize text-[10px] px-1.5">
                        {((doc.document_type as string) || "").replace(/_/g, " ")}
                      </Badge>
                      {isExpired && (
                        <Badge variant="destructive" className="text-[10px] px-1.5">
                          {td("expired")}
                        </Badge>
                      )}
                      {isExpiringSoon && !isExpired && (
                        <Badge variant="warning" className="text-[10px] px-1.5">
                          {td("expiringSoon")}
                        </Badge>
                      )}
                      {expiryDate && (
                        <span className="text-xs text-text-secondary font-mono ltr-nums">
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
            title={t("noDocuments")}
            description={td("noDocumentsDescription")}
            action={
              <Link
                href={`/${locale}/documents/upload?entity_type=tenant&entity_id=${id}`}
                className="inline-flex items-center gap-1.5 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                {td("upload")}
              </Link>
            }
          />
        )}
      </section>

      {/* Maintenance Section */}
      <section>
        <SectionHeading icon={Wrench} title={t("maintenance")} count={maintenance?.length} />
        {maintenance && maintenance.length > 0 ? (
          <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{t("maintenanceDate")}</TableHead>
                    <TableHead className="px-4">{t("maintenanceTitle")}</TableHead>
                    <TableHead className="px-4">{t("maintenancePriority")}</TableHead>
                    <TableHead className="px-4">{t("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenance.map((req: Record<string, unknown>) => (
                    <TableRow key={req.id as string}>
                      <TableCell className="px-4 text-text-primary font-mono ltr-nums">
                        <Link
                          href={`/${locale}/maintenance/${req.id}`}
                          className="hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                        >
                          {new Date(req.created_at as string).toLocaleDateString()}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4">
                        <Link
                          href={`/${locale}/maintenance/${req.id}`}
                          className="text-sm font-medium text-text-primary hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                        >
                          {(req.description as string)?.slice(0, 60) || "—"}
                          {(req.description as string)?.length > 60 ? "…" : ""}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4">
                        <Badge
                          variant={
                            URGENCY_VARIANTS[(req.urgency as string) || "low"] ??
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
            <ul className="md:hidden divide-y divide-border/40">
              {maintenance.map((req: Record<string, unknown>) => (
                <li key={`m-${req.id as string}`}>
                  <Link
                    href={`/${locale}/maintenance/${req.id}`}
                    className="block p-4 hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <p className="text-sm font-medium text-text-primary leading-snug">
                      {(req.description as string)?.slice(0, 60) || "—"}
                      {(req.description as string)?.length > 60 ? "…" : ""}
                    </p>
                    <p className="text-xs text-text-secondary font-mono ltr-nums mt-1">
                      {new Date(req.created_at as string).toLocaleDateString()}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          URGENCY_VARIANTS[(req.urgency as string) || "low"] ??
                          "secondary"
                        }
                        className="capitalize text-[10px] px-1.5"
                      >
                        {req.urgency ? tm(`urgencies.${req.urgency}`) : "—"}
                      </Badge>
                      <Badge
                        variant={
                          MAINTENANCE_STATUS_VARIANTS[
                            (req.status as string) || "open"
                          ] ?? "secondary"
                        }
                        className="capitalize text-[10px] px-1.5"
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
            title={t("noMaintenance")}
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
      <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/15">
        <Icon aria-hidden className="h-4 w-4 text-accent" />
      </div>
      <h2 className="text-base font-semibold text-text-primary font-display tracking-tight">
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className="text-xs font-medium text-text-secondary bg-surface-elevated border border-border/40 px-2 py-0.5 rounded-md font-mono ltr-nums">
          {count}
        </span>
      )}
    </div>
  );
}
