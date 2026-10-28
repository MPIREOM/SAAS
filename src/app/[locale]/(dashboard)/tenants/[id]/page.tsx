import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY, formatAmount } from "@/lib/currency";
import { getDocumentUrls } from "@/lib/utils/document-url";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { SharePortalButton } from "@/components/tenants/share-portal-button";
import { EditPaymentMethod } from "@/components/payments/edit-payment-method";
import { EMandatePanel, type LeaseOption } from "@/components/tenants/e-mandate-panel";
import { listMandatesForTenant } from "@/lib/e-mandates/service";
import {
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
  Landmark,
  ArrowRightLeft,
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
  const te = await getTranslations("eMandates");
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

  const { mandates, collections } = await listMandatesForTenant(supabase, id);
  const leaseOptions: LeaseOption[] = (leases ?? []).map((l: Record<string, unknown>) => {
    const unit = l.units as Record<string, unknown> | null;
    const property = unit?.properties as Record<string, unknown> | null;
    return {
      id: l.id as string,
      label: `${(property?.name as string) ?? ""} · ${tc("unit")} ${(unit?.unit_number as string) ?? ""}`.trim(),
      monthlyRent: Number(l.monthly_rent || 0),
      paymentDueDay: Number(l.payment_due_day || 1),
      isActive: !!l.is_active,
    };
  });

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

  const formatMoney = (value: unknown) => formatAmount(Number(value || 0));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={tenant.full_name}
        breadcrumbs={[
          { label: t("title"), href: `/${locale}/tenants` },
          { label: tenant.full_name },
        ]}
      >
        <Link
          href={`/${locale}/tenants/${id}/edit`}
          className={cn(buttonVariants({ size: "sm" }))}
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
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          <ScrollText aria-hidden="true" className="h-4 w-4" />
          {t("statement")}
        </Link>
        <Link
          href={`/api/tenants/${id}/unpaid-invoices/pdf`}
          target="_blank"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          title={ti("downloadUnpaidPDFDescription")}
        >
          <FileDown aria-hidden="true" className="h-4 w-4" />
          {ti("downloadUnpaidPDF")}
        </Link>
        {tenant.status === "active" && (
          <>
            <Link
              href={`/${locale}/tenants/${id}/renew-lease`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              {tl("renewLease")}
            </Link>
            <Link
              href={`/${locale}/tenants/${id}/relocate`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
              {t("relocate.button")}
            </Link>
            <Link
              href={`/${locale}/tenants/${id}/move-out`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {t("moveOut")}
            </Link>
          </>
        )}
      </PageHeader>

      {/* Identity card */}
      <section className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3.5 border-b border-border p-4">
          <span
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-tint text-lg font-bold text-accent-tint-foreground"
          >
            {(tenant.full_name || "?").trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            {/* The name is already the page title; this row carries status and ID */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={tenant.status === "archived" ? "secondary" : "success"}>
                {t(tenant.status || "active")}
              </Badge>
              <span className="text-[12.5px] text-text-tertiary">
                {t("tenantId")}:{" "}
                <span className="ltr-nums tabular-nums">{tenant.id}</span>
              </span>
            </div>
          </div>
        </div>
        <dl className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
              <Phone aria-hidden="true" className="h-3.5 w-3.5 text-text-tertiary" />
              {t("phone")}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums ltr-nums truncate">
              {tenant.phone || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
              <Mail aria-hidden="true" className="h-3.5 w-3.5 text-text-tertiary" />
              {t("email")}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-text-primary truncate">
              {tenant.email || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
              <Globe aria-hidden="true" className="h-3.5 w-3.5 text-text-tertiary" />
              {t("nationality")}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-text-primary truncate">
              {tenant.nationality || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
              <Shield aria-hidden="true" className="h-3.5 w-3.5 text-text-tertiary" />
              {t("nationalId")}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums ltr-nums truncate">
              {tenant.national_id || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
              <Phone aria-hidden="true" className="h-3.5 w-3.5 text-text-tertiary" />
              {t("emergencyContact")}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-text-primary truncate">
              {tenant.emergency_contact || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
              <Globe aria-hidden="true" className="h-3.5 w-3.5 text-text-tertiary" />
              {t("languagePreference")}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-text-primary truncate">
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
            <div className="p-1.5 rounded-lg bg-destructive-tint border border-destructive/30">
              <LogOut aria-hidden="true" className="h-4 w-4 text-destructive" />
            </div>
            <h2 className="text-base font-semibold text-text-primary font-display">
              {t("moveOutSummary")}
            </h2>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-5">
            <div>
              <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
                <Calendar aria-hidden="true" className="h-3.5 w-3.5 text-text-tertiary" />
                {t("vacateDate")}
              </dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums ltr-nums">
                {moveOutLease.vacate_date
                  ? new Date(
                      moveOutLease.vacate_date as string
                    ).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-medium text-text-secondary">
                {t("vacateReason")}
              </dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-text-primary">
                {moveOutLease.vacate_reason
                  ? t(`reasons.${moveOutLease.vacate_reason}`)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[12.5px] font-medium text-text-secondary">
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
              <dt className="text-[12.5px] font-medium text-text-secondary">
                {t("finalInspection")}
              </dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-text-primary flex items-center gap-1.5">
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
              <dt className="text-[12.5px] font-medium text-text-secondary">
                {t("keysReturned")}
              </dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-text-primary flex items-center gap-1.5">
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
                <dt className="text-[12.5px] font-medium text-text-secondary">
                  {t("vacateNotes")}
                </dt>
                <dd className="mt-0.5 text-[15px] font-semibold text-text-primary">
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
                  className="bg-surface border border-border rounded-xl shadow-card p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <Badge variant={lease.is_active ? "success" : "secondary"}>
                      {lease.is_active ? t("leaseActive") : t("leaseExpired")}
                    </Badge>
                    {Boolean(lease.is_active) && daysRemaining > 0 && (
                      <span className="text-xs text-text-secondary">
                        <span className="tabular-nums ltr-nums font-semibold text-text-primary">
                          {daysRemaining}
                        </span>{" "}
                        {t("daysRemaining")}
                      </span>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-5">
                    <div className="min-w-0">
                      <dt className="text-[12.5px] font-medium text-text-secondary">
                        {t("property")}
                      </dt>
                      <dd className="mt-0.5 text-[15px] font-semibold text-text-primary truncate">
                        {(property?.name as string) || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[12.5px] font-medium text-text-secondary">
                        {t("unit")}
                      </dt>
                      <dd className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums ltr-nums truncate">
                        {(unit?.unit_number as string) || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[12.5px] font-medium text-text-secondary">
                        {t("startDate")}
                      </dt>
                      <dd className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums ltr-nums">
                        {startDate.toLocaleDateString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[12.5px] font-medium text-text-secondary">
                        {t("endDate")}
                      </dt>
                      <dd className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums ltr-nums">
                        {endDate.toLocaleDateString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[12.5px] font-medium text-text-secondary">
                        {t("monthlyRent")}
                      </dt>
                      <dd className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums ltr-nums">
                        {formatMoney(lease.monthly_rent)}{" "}
                        <span className="text-xs font-medium text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[12.5px] font-medium text-text-secondary">
                        {t("securityDeposit")}
                      </dt>
                      <dd className="mt-0.5 text-[15px] font-semibold text-text-primary tabular-nums ltr-nums">
                        {formatMoney(lease.security_deposit)}{" "}
                        <span className="text-xs font-medium text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  {Boolean(lease.is_active) && endDate > startDate && (
                    <div
                      className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken"
                      role="progressbar"
                      aria-label={t("daysRemaining")}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(
                        Math.min(1, Math.max(0, (now.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime()))) * 100
                      )}
                    >
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${Math.min(100, Math.max(0, ((now.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
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
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
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
                      <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                        {new Date(payment.payment_date as string).toLocaleDateString()}
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
                      {new Date(payment.payment_date as string).toLocaleDateString()}
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
                      {t("reference")} ·{" "}
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
            title={t("noPayments")}
          />
        )}
      </section>

      {/* Cheques Section */}
      <section id="cheques-section">
        <SectionHeading icon={Banknote} title={tch("title")} count={cheques?.length} />
        {cheques && cheques.length > 0 ? (
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
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
                    <p className="text-sm font-semibold text-text-primary tabular-nums ltr-nums text-end shrink-0">
                      {formatMoney(cheque.amount)}{" "}
                      <span className="text-xs font-normal text-text-secondary">
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

      {/* E-Mandate Section */}
      <section id="e-mandates-section">
        <SectionHeading icon={Landmark} title={te("title")} count={mandates.length} />
        <EMandatePanel
          tenantName={tenant.full_name}
          tenantPhone={tenant.phone}
          locale={locale}
          leases={leaseOptions}
          mandates={mandates}
          collections={collections}
        />
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
            className={buttonVariants({ size: "sm" })}
          >
            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
            {td("upload")}
          </Link>
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
                              <Badge variant="destructive" >
                                {td("expired")}
                              </Badge>
                            )}
                            {isExpiringSoon && !isExpired && (
                              <Badge variant="warning" >
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
                      <Badge variant="default" className="capitalize">
                        {((doc.document_type as string) || "").replace(/_/g, " ")}
                      </Badge>
                      {isExpired && (
                        <Badge variant="destructive" >
                          {td("expired")}
                        </Badge>
                      )}
                      {isExpiringSoon && !isExpired && (
                        <Badge variant="warning" >
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
            title={t("noDocuments")}
            description={td("noDocumentsDescription")}
            action={
              <Link
                href={`/${locale}/documents/upload?entity_type=tenant&entity_id=${id}`}
                className={buttonVariants({ size: "sm" })}
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
          <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
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
                      <TableCell className="px-4 text-text-primary tabular-nums ltr-nums">
                        <Link
                          href={`/${locale}/maintenance/${req.id}`}
                          className="hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                        >
                          {new Date(req.created_at as string).toLocaleDateString()}
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
                          URGENCY_VARIANTS[(req.urgency as string) || "low"] ??
                          "secondary"
                        }
                        className="capitalize"
                      >
                        {req.urgency ? tm(`urgencies.${req.urgency}`) : "—"}
                      </Badge>
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
      <Icon aria-hidden className="h-[18px] w-[18px] text-text-tertiary" />
      <h2 className="text-[15px] font-semibold text-text-primary font-display">
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-neutral-tint px-2 py-px text-xs font-semibold text-text-secondary tabular-nums ltr-nums">
          {count}
        </span>
      )}
    </div>
  );
}
