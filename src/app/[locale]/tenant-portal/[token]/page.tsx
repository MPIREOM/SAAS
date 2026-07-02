"use client";

import { CURRENCY } from "@/lib/currency";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  User,
  FileText,
  CreditCard,
  Folder,
  Banknote,
  AlertTriangle,
  Phone,
  Mail,
  Globe,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Building2,
  Shield,
} from "lucide-react";

interface TenantData {
  tenant: Record<string, unknown>;
  leases: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  cheques: Record<string, unknown>[];
}

type StatusVariant = "success" | "warning" | "destructive" | "secondary";

const STATUS_VARIANTS: Record<string, StatusVariant> = {
  paid: "success",
  cleared: "success",
  pending: "warning",
  overdue: "destructive",
  bounced: "destructive",
};

export default function TenantPortalPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const t = useTranslations("tenantPortal");
  const tc = useTranslations("common");
  const ti = useTranslations("invoices");
  const tch = useTranslations("cheques");
  const tt = useTranslations("tenants");
  const [data, setData] = useState<TenantData | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validate = async () => {
      const { token } = await params;
      try {
        const res = await fetch("/api/tenant-portal/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          setInvalid(true);
          setLoading(false);
          return;
        }
        const result = await res.json();
        setData(result);
      } catch {
        setInvalid(true);
      }
      setLoading(false);
    };
    validate();
  }, [params]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex flex-col items-center justify-center gap-3 p-4">
        <Spinner label={tc("loading")} sizeClassName="h-8 w-8" />
        <p aria-hidden="true" className="text-sm text-text-secondary">
          {tc("loading")}
        </p>
      </div>
    );
  }

  if (invalid || !data?.tenant) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center animate-fade-in-up">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/25">
            <AlertTriangle aria-hidden="true" className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary font-display">
            {t("invalidLink")}
          </h1>
          <Alert variant="destructive" className="text-start">
            {t("invalidLinkMessage")}
          </Alert>
          <p className="text-xs text-text-secondary/50 pt-2">
            MPIRE Property Management
          </p>
        </div>
      </div>
    );
  }

  const { tenant, leases, invoices, payments, documents, cheques } = data;
  const now = new Date();

  const invoiceStatusLabel = (status: string) =>
    ["paid", "pending", "overdue", "partial"].includes(status)
      ? ti(status)
      : status;

  const chequeStatusLabel = (status: string) =>
    ["pending", "cleared", "bounced", "cancelled"].includes(status)
      ? tch(`statuses.${status}`)
      : status;

  const tenantStatus = tenant.status as string;
  const tenantStatusLabel =
    tenantStatus === "active"
      ? tt("active")
      : tenantStatus === "archived"
        ? tt("archived")
        : tenantStatus;

  return (
    <div className="min-h-screen bg-background noise-overlay">
      {/* Header */}
      <header className="border-b border-border/60 bg-surface/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
            <Shield aria-hidden="true" className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-text-primary font-display truncate">
              {t("title")}
            </h1>
            <p className="text-xs text-text-secondary truncate">{t("subtitle")}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 stagger-children">
        {/* Tenant Profile */}
        <section className="bg-surface border border-border/60 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-12 w-12 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
              <User aria-hidden="true" className="h-6 w-6 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-text-primary font-display truncate">
                {tenant.full_name as string}
              </h2>
              <div className="mt-1">
                <Badge
                  variant={tenantStatus === "active" ? "success" : "secondary"}
                  className="capitalize"
                >
                  {tenantStatusLabel}
                </Badge>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-border/40 pt-4">
            <InfoItem icon={Phone} label={t("phone")} value={tenant.phone as string} mono />
            <InfoItem icon={Mail} label={t("email")} value={(tenant.email as string) || "—"} />
            <InfoItem icon={Globe} label={t("nationality")} value={(tenant.nationality as string) || "—"} />
          </div>
        </section>

        {/* Active Lease */}
        {leases.length > 0 && (
          <section>
            <SectionHeader icon={FileText} title={t("leaseInfo")} />
            <div className="space-y-3">
              {leases.map((lease) => {
                const unit = lease.units as Record<string, unknown> | null;
                const property = unit?.properties as Record<string, unknown> | null;
                return (
                  <div
                    key={lease.id as string}
                    className="bg-surface border border-border/60 rounded-xl p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 aria-hidden="true" className="h-4 w-4 text-accent shrink-0" />
                        <span className="text-sm font-medium text-text-primary truncate">
                          {(property?.name as string) || "—"}
                        </span>
                        <span className="text-xs text-text-secondary whitespace-nowrap">
                          &middot; {t("unit")}{" "}
                          <span className="font-mono ltr-nums">
                            {(unit?.unit_number as string) || "—"}
                          </span>
                        </span>
                      </div>
                      <Badge variant={lease.is_active ? "success" : "secondary"}>
                        {lease.is_active ? t("active") : t("expired")}
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                          {t("startDate")}
                        </dt>
                        <dd className="text-text-primary font-mono ltr-nums mt-1">
                          {new Date(lease.start_date as string).toLocaleDateString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                          {t("endDate")}
                        </dt>
                        <dd className="text-text-primary font-mono ltr-nums mt-1">
                          {new Date(lease.end_date as string).toLocaleDateString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                          {t("monthlyRent")}
                        </dt>
                        <dd className="text-text-primary font-semibold font-mono ltr-nums mt-1">
                          {lease.monthly_rent as number}{" "}
                          <span className="text-[10px] font-normal text-text-secondary">
                            {CURRENCY.code}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                          {t("deposit")}
                        </dt>
                        <dd className="text-text-primary font-mono ltr-nums mt-1">
                          {(lease.security_deposit as number) || 0}{" "}
                          <span className="text-[10px] font-normal text-text-secondary">
                            {CURRENCY.code}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Invoices */}
        {invoices.length > 0 && (
          <section>
            <SectionHeader icon={CreditCard} title={t("invoices")} count={invoices.length} />
            <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-4">{t("dueDate")}</TableHead>
                      <TableHead className="px-4">{t("period")}</TableHead>
                      <TableHead className="px-4 text-end">{t("amount")}</TableHead>
                      <TableHead className="px-4">{t("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow
                        key={inv.id as string}
                        className={
                          (inv.status as string) === "overdue" ? "bg-destructive/5" : ""
                        }
                      >
                        <TableCell className="px-4 text-text-primary font-mono ltr-nums">
                          {new Date(inv.due_date as string).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary">
                          {(inv.period_label as string) || "—"}
                        </TableCell>
                        <TableCell
                          className={`px-4 text-end font-semibold font-mono ltr-nums ${
                            (inv.status as string) === "overdue"
                              ? "text-destructive"
                              : (inv.status as string) === "paid"
                                ? "text-text-secondary"
                                : "text-text-primary"
                          }`}
                        >
                          {Number(inv.amount).toFixed(2)}{" "}
                          <span className="text-[10px] font-normal text-text-secondary">
                            {CURRENCY.code}
                          </span>
                        </TableCell>
                        <TableCell className="px-4">
                          <StatusBadge
                            status={inv.status as string}
                            label={invoiceStatusLabel(inv.status as string)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile card list */}
              <ul className="md:hidden divide-y divide-border/40">
                {invoices.map((inv) => (
                  <li
                    key={`m-${inv.id as string}`}
                    className={`p-4 ${
                      (inv.status as string) === "overdue" ? "bg-destructive/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {(inv.period_label as string) || "—"}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {t("dueDate")} ·{" "}
                          <span className="font-mono ltr-nums">
                            {new Date(inv.due_date as string).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                      <p
                        className={`text-sm font-semibold font-mono ltr-nums text-end shrink-0 ${
                          (inv.status as string) === "overdue"
                            ? "text-destructive"
                            : (inv.status as string) === "paid"
                              ? "text-text-secondary"
                              : "text-text-primary"
                        }`}
                      >
                        {Number(inv.amount).toFixed(2)}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </p>
                    </div>
                    <div className="mt-2.5">
                      <StatusBadge
                        status={inv.status as string}
                        label={invoiceStatusLabel(inv.status as string)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Payments */}
        {payments.length > 0 && (
          <section>
            <SectionHeader icon={Banknote} title={t("payments")} count={payments.length} />
            <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table className="min-w-[450px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-4">{t("date")}</TableHead>
                      <TableHead className="px-4 text-end">{t("amount")}</TableHead>
                      <TableHead className="px-4">{t("method")}</TableHead>
                      <TableHead className="px-4">{t("reference")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id as string}>
                        <TableCell className="px-4 text-text-primary font-mono ltr-nums">
                          {new Date(p.payment_date as string).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4 text-end font-semibold text-success font-mono ltr-nums">
                          {Number(p.amount).toFixed(2)}{" "}
                          <span className="text-[10px] font-normal text-text-secondary">
                            {CURRENCY.code}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary">
                          {p.method ? t(`methods.${p.method}`) : "—"}
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary font-mono ltr-nums">
                          {(p.reference_number as string) || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile card list */}
              <ul className="md:hidden divide-y divide-border/40">
                {payments.map((p) => (
                  <li key={`m-${p.id as string}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">
                          {p.method ? t(`methods.${p.method}`) : "—"}
                        </p>
                        <p className="text-xs text-text-secondary font-mono ltr-nums mt-0.5">
                          {new Date(p.payment_date as string).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-success font-mono ltr-nums text-end shrink-0">
                        {Number(p.amount).toFixed(2)}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </p>
                    </div>
                    {Boolean(p.reference_number) && (
                      <p className="text-xs text-text-secondary mt-2 truncate">
                        {t("reference")} ·{" "}
                        <span className="font-mono ltr-nums">
                          {p.reference_number as string}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Cheques */}
        {cheques.length > 0 && (
          <section>
            <SectionHeader icon={CreditCard} title={t("cheques")} count={cheques.length} />
            <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-4">{t("chequeNo")}</TableHead>
                      <TableHead className="px-4">{t("bank")}</TableHead>
                      <TableHead className="px-4">{t("chequeDate")}</TableHead>
                      <TableHead className="px-4 text-end">{t("amount")}</TableHead>
                      <TableHead className="px-4">{t("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cheques.map((c) => (
                      <TableRow
                        key={c.id as string}
                        className={
                          (c.status as string) === "bounced" ? "bg-destructive/5" : ""
                        }
                      >
                        <TableCell className="px-4 font-medium text-text-primary font-mono ltr-nums">
                          #{c.cheque_number as string}
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary">
                          {c.bank_name as string}
                        </TableCell>
                        <TableCell className="px-4 text-text-primary font-mono ltr-nums">
                          {new Date(c.cheque_date as string).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4 text-end font-semibold text-text-primary font-mono ltr-nums">
                          {Number(c.amount).toFixed(2)}{" "}
                          <span className="text-[10px] font-normal text-text-secondary">
                            {CURRENCY.code}
                          </span>
                        </TableCell>
                        <TableCell className="px-4">
                          <StatusBadge
                            status={c.status as string}
                            label={chequeStatusLabel(c.status as string)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile card list */}
              <ul className="md:hidden divide-y divide-border/40">
                {cheques.map((c) => (
                  <li
                    key={`m-${c.id as string}`}
                    className={`p-4 ${
                      (c.status as string) === "bounced" ? "bg-destructive/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary font-mono ltr-nums truncate">
                          #{c.cheque_number as string}
                        </p>
                        <p className="text-xs text-text-secondary truncate mt-0.5">
                          {c.bank_name as string}
                          {" · "}
                          <span className="font-mono ltr-nums">
                            {new Date(c.cheque_date as string).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-text-primary font-mono ltr-nums text-end shrink-0">
                        {Number(c.amount).toFixed(2)}{" "}
                        <span className="text-[10px] font-normal text-text-secondary">
                          {CURRENCY.code}
                        </span>
                      </p>
                    </div>
                    <div className="mt-2.5">
                      <StatusBadge
                        status={c.status as string}
                        label={chequeStatusLabel(c.status as string)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <section>
            <SectionHeader icon={Folder} title={t("documents")} count={documents.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map((doc) => {
                const expiryDate = doc.expiry_date
                  ? new Date(doc.expiry_date as string)
                  : null;
                const isExpired = expiryDate && expiryDate < now;

                return (
                  <div
                    key={doc.id as string}
                    className="bg-surface border border-border/60 rounded-xl p-4 flex items-start gap-3 transition-colors hover:border-accent/30"
                  >
                    <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText aria-hidden="true" className="h-4 w-4 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {(doc.file_name as string) || "—"}
                      </p>
                      <p className="text-xs text-text-secondary capitalize mt-0.5">
                        {((doc.document_type as string) || "").replace(/_/g, " ")}
                      </p>
                      {expiryDate && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Calendar
                            aria-hidden="true"
                            className="h-3 w-3 text-text-secondary"
                          />
                          <span
                            className={`text-xs font-mono ltr-nums ${
                              isExpired ? "text-destructive" : "text-text-secondary"
                            }`}
                          >
                            {expiryDate.toLocaleDateString()}
                          </span>
                          {isExpired && (
                            <Badge variant="destructive" className="text-[10px] px-1.5">
                              {t("expired")}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {Boolean(doc.file_url) && (
                      <a
                        href={doc.file_url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t("openDocument")}
                        className="p-2 -m-0.5 rounded-lg text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors shrink-0"
                      >
                        <ExternalLink aria-hidden="true" className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center py-4">
          <p className="text-xs text-text-secondary/50">
            MPIRE Property Management
          </p>
        </footer>
      </main>
    </div>
  );
}

// Helper components
function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/15">
        <Icon aria-hidden className="h-4 w-4 text-accent" />
      </div>
      <h2 className="text-base font-semibold text-text-primary font-display">
        {title}
      </h2>
      {count !== undefined && (
        <span className="text-xs font-medium text-text-secondary bg-surface-elevated border border-border/40 px-2 py-0.5 rounded-md font-mono ltr-nums">
          {count}
        </span>
      )}
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Icon aria-hidden className="h-4 w-4 text-text-secondary shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
          {label}
        </p>
        <p
          className={`text-sm text-text-primary mt-0.5 truncate ${
            mono ? "font-mono ltr-nums" : ""
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const variant = STATUS_VARIANTS[status] ?? "secondary";
  const Icon =
    variant === "success"
      ? CheckCircle2
      : variant === "warning"
        ? Clock
        : XCircle;

  return (
    <Badge variant={variant} className="gap-1 capitalize">
      <Icon aria-hidden="true" className="h-3 w-3" />
      {label}
    </Badge>
  );
}
