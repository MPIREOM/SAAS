"use client";

import { CURRENCY } from "@/lib/currency";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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

export default function TenantPortalPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const t = useTranslations("tenantPortal");
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (invalid || !data?.tenant) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary font-display">
            {t("invalidLink")}
          </h1>
          <p className="text-sm text-text-secondary">{t("invalidLinkMessage")}</p>
        </div>
      </div>
    );
  }

  const { tenant, leases, invoices, payments, documents, cheques } = data;
  const now = new Date();

  const statusColors: Record<string, string> = {
    paid: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    overdue: "bg-destructive/10 text-destructive",
    cleared: "bg-success/10 text-success",
    bounced: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="min-h-screen bg-background noise-overlay">
      {/* Header */}
      <div className="border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Shield className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-primary font-display">
              {t("title")}
            </h1>
            <p className="text-xs text-text-secondary">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Tenant Profile */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <User className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary font-display">
                {tenant.full_name as string}
              </h2>
              <p className="text-xs text-text-secondary capitalize">
                {tenant.status as string}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    className="bg-surface border border-border rounded-xl p-5"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-accent" />
                        <span className="text-sm font-medium text-text-primary">
                          {(property?.name as string) || "—"}
                        </span>
                        <span className="text-xs text-text-secondary">
                          &middot; {t("unit")} {(unit?.unit_number as string) || "—"}
                        </span>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          lease.is_active
                            ? "bg-success/10 text-success"
                            : "bg-text-secondary/10 text-text-secondary"
                        }`}
                      >
                        {lease.is_active ? t("active") : t("expired")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-text-secondary">{t("startDate")}</span>
                        <p className="text-text-primary font-mono ltr-nums mt-0.5">
                          {new Date(lease.start_date as string).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-text-secondary">{t("endDate")}</span>
                        <p className="text-text-primary font-mono ltr-nums mt-0.5">
                          {new Date(lease.end_date as string).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-text-secondary">{t("monthlyRent")}</span>
                        <p className="text-text-primary font-mono ltr-nums mt-0.5">
                          {lease.monthly_rent as number} {CURRENCY.code}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-text-secondary">{t("deposit")}</span>
                        <p className="text-text-primary font-mono ltr-nums mt-0.5">
                          {(lease.security_deposit as number) || 0} {CURRENCY.code}
                        </p>
                      </div>
                    </div>
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
            <div className="bg-surface border border-border rounded-xl overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/30">
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("dueDate")}
                    </th>
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("period")}
                    </th>
                    <th className="text-end text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("amount")}
                    </th>
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("status")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {invoices.map((inv) => (
                    <tr key={inv.id as string}>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-primary font-mono ltr-nums">
                          {new Date(inv.due_date as string).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary">
                          {inv.period_label as string || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span className="text-sm font-medium text-text-primary font-mono ltr-nums">
                          {Number(inv.amount).toFixed(2)} {CURRENCY.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={inv.status as string} colors={statusColors} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Payments */}
        {payments.length > 0 && (
          <section>
            <SectionHeader icon={Banknote} title={t("payments")} count={payments.length} />
            <div className="bg-surface border border-border rounded-xl overflow-x-auto">
              <table className="w-full min-w-[450px]">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/30">
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("date")}
                    </th>
                    <th className="text-end text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("amount")}
                    </th>
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("method")}
                    </th>
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("reference")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {payments.map((p) => (
                    <tr key={p.id as string}>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-primary font-mono ltr-nums">
                          {new Date(p.payment_date as string).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span className="text-sm font-medium text-text-primary font-mono ltr-nums">
                          {Number(p.amount).toFixed(2)} {CURRENCY.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary capitalize">
                          {((p.method as string) || "—").replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary font-mono">
                          {(p.reference_number as string) || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Cheques */}
        {cheques.length > 0 && (
          <section>
            <SectionHeader icon={CreditCard} title={t("cheques")} count={cheques.length} />
            <div className="bg-surface border border-border rounded-xl overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/30">
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("chequeNo")}
                    </th>
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("bank")}
                    </th>
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("chequeDate")}
                    </th>
                    <th className="text-end text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("amount")}
                    </th>
                    <th className="text-start text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-4 py-2.5">
                      {t("status")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {cheques.map((c) => (
                    <tr key={c.id as string}>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-text-primary font-mono">
                          #{c.cheque_number as string}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary">
                          {c.bank_name as string}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-primary font-mono ltr-nums">
                          {new Date(c.cheque_date as string).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span className="text-sm font-medium text-text-primary font-mono ltr-nums">
                          {Number(c.amount).toFixed(2)} {CURRENCY.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status as string} colors={statusColors} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3"
                  >
                    <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="h-4 w-4 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {(doc.file_name as string) || "—"}
                      </p>
                      <p className="text-xs text-text-secondary capitalize mt-0.5">
                        {((doc.document_type as string) || "").replace(/_/g, " ")}
                      </p>
                      {expiryDate && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Calendar className="h-3 w-3 text-text-secondary" />
                          <span
                            className={`text-xs font-mono ltr-nums ${
                              isExpired ? "text-destructive" : "text-text-secondary"
                            }`}
                          >
                            {expiryDate.toLocaleDateString()}
                          </span>
                          {isExpired && (
                            <span className="text-[10px] text-destructive font-medium">
                              {t("expired")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {Boolean(doc.file_url) && (
                      <a
                        href={doc.file_url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-text-secondary/50">
            MPIRE Property Management
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper components
function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="p-1.5 rounded-lg bg-accent/10">
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <h2 className="text-base font-semibold text-text-primary font-display">
        {title}
      </h2>
      {count !== undefined && (
        <span className="text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md">
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
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-text-secondary shrink-0" />
      <div>
        <p className="text-[10px] text-text-secondary uppercase tracking-wider">{label}</p>
        <p className={`text-sm text-text-primary mt-0.5 ${mono ? "font-mono ltr-nums" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  colors,
}: {
  status: string;
  colors: Record<string, string>;
}) {
  const icon =
    status === "paid" || status === "cleared" ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : status === "pending" ? (
      <Clock className="h-3 w-3" />
    ) : (
      <XCircle className="h-3 w-3" />
    );

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
        colors[status] || "bg-text-secondary/10 text-text-secondary"
      }`}
    >
      {icon}
      {status}
    </span>
  );
}
