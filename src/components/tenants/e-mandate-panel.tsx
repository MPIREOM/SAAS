"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Landmark,
  Plus,
  Copy,
  Check,
  MessageSquare,
  Ban,
  Download,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { CURRENCY, formatCurrency } from "@/lib/currency";
import type { CollectionRow, MandateRow } from "@/lib/e-mandates/service";

type BadgeVariant = "default" | "secondary" | "warning" | "destructive" | "success" | "outline";

const MANDATE_VARIANTS: Record<string, BadgeVariant> = {
  pending_otp: "warning",
  active: "success",
  suspended: "warning",
  cancelled: "secondary",
  failed: "destructive",
  expired: "secondary",
};

const COLLECTION_VARIANTS: Record<string, BadgeVariant> = {
  scheduled: "secondary",
  submitted: "warning",
  settled: "success",
  failed: "destructive",
  returned: "destructive",
  cancelled: "secondary",
};

export interface LeaseOption {
  id: string;
  label: string;
  monthlyRent: number;
  paymentDueDay: number;
  isActive: boolean;
}

interface Props {
  tenantName: string;
  tenantPhone?: string | null;
  locale: string;
  leases: LeaseOption[];
  mandates: MandateRow[];
  collections: CollectionRow[];
}

export function EMandatePanel({ tenantName, tenantPhone, locale, leases, mandates, collections }: Props) {
  const t = useTranslations("eMandates");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();

  const activeLeases = leases.filter((l) => l.isActive);
  const liveLeaseIds = new Set(mandates.filter((m) => ["pending_otp", "active", "suspended"].includes(m.status)).map((m) => m.lease_id));
  const eligibleLeases = activeLeases.filter((l) => !liveLeaseIds.has(l.id));

  const [open, setOpen] = useState(false);
  const [leaseId, setLeaseId] = useState(eligibleLeases[0]?.id ?? "");
  const [amount, setAmount] = useState(eligibleLeases[0] ? String(eligibleLeases[0].monthlyRent) : "");
  const [day, setDay] = useState(eligibleLeases[0] ? String(eligibleLeases[0].paymentDueDay) : "1");
  const [account, setAccount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [debtorName, setDebtorName] = useState(tenantName);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [created, setCreated] = useState<MandateRow | null>(null);

  const selectLease = (id: string) => {
    setLeaseId(id);
    const l = leases.find((x) => x.id === id);
    if (l) {
      setAmount(String(l.monthlyRent));
      setDay(String(Math.min(28, l.paymentDueDay || 1)));
    }
  };

  const otpLink = (token: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/${locale}/tenant-portal/e-mandate/${token}`;
  };

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(otpLink(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareWhatsApp = (token: string) => {
    const phone = tenantPhone?.replace(/\D/g, "") || "";
    const message = encodeURIComponent(`${t("whatsappMessage")}\n\n${otpLink(token)}`);
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!leaseId) return setFormError(t("errors.leaseRequired"));
    if (!account.trim()) return setFormError(t("errors.accountRequired"));
    setSubmitting(true);
    try {
      const res = await fetch("/api/e-mandates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lease_id: leaseId,
          amount: amount || null,
          collection_day: day || null,
          debtor_account: account.trim(),
          debtor_bank_code: bankCode.trim() || null,
          debtor_name: debtorName.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { mandate?: MandateRow; error?: string };
      if (!res.ok || !data.mandate) {
        setFormError(data.error || t("errors.createFailed"));
        return;
      }
      setCreated(data.mandate);
      setAccount("");
      toast({ title: t("toasts.created"), variant: "success" });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (id: string, action: "cancel" | "collect" | "resend_otp") => {
    if (action === "cancel" && !window.confirm(t("confirmCancel"))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/e-mandates/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; outcome?: string; reason?: string; otp_token?: string };
      if (!res.ok) {
        const detail = data.reason && t.has(`skipReasons.${data.reason}`) ? t(`skipReasons.${data.reason}`) : (data.reason ?? data.error);
        toast({ title: t("toasts.actionFailed"), description: String(detail ?? ""), variant: "destructive" });
        return;
      }
      if (action === "collect") {
        toast({ title: t(`toasts.collect_${data.outcome}`), variant: data.outcome === "failed" ? "destructive" : "success" });
      } else if (action === "resend_otp") {
        toast({ title: t("toasts.otpResent"), variant: "success" });
      } else {
        toast({ title: t("toasts.cancelled"), variant: "success" });
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const collectionsFor = (mandateId: string) => collections.filter((c) => c.mandate_id === mandateId);
  const money = (v: string | number) => `${formatCurrency(v)} ${CURRENCY.code}`;
  const leaseLabel = (id: string) => leases.find((l) => l.id === id)?.label ?? "—";

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-sm text-text-secondary">{t("sectionDescription")}</p>
        {eligibleLeases.length > 0 && (
          <Button size="sm" onClick={() => { setCreated(null); setFormError(null); setOpen(true); }}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("setUp")}
          </Button>
        )}
      </div>

      {mandates.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-5 w-5" />}
          title={t("emptyTitle")}
          description={eligibleLeases.length > 0 ? t("emptyDescription") : t("emptyNoLease")}
        />
      ) : (
        <div className="space-y-4">
          {mandates.map((m) => {
            const cols = collectionsFor(m.id);
            const busy = busyId === m.id;
            return (
              <div key={m.id} className="bg-surface border border-border/60 rounded-xl overflow-hidden">
                <div className="p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={MANDATE_VARIANTS[m.status] ?? "secondary"}>{t(`status.${m.status}`)}</Badge>
                      <span className="text-sm text-text-primary font-medium truncate">{leaseLabel(m.lease_id)}</span>
                    </div>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <dt className="text-text-secondary">{t("fields.amount")}</dt>
                        <dd className="font-mono ltr-nums text-text-primary">{money(m.amount)}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">{t("fields.collectionDay")}</dt>
                        <dd className="font-mono ltr-nums text-text-primary">{m.collection_day}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">{t("fields.account")}</dt>
                        <dd className="font-mono ltr-nums text-text-primary">{m.debtor_account_masked ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">{t("fields.provider")}</dt>
                        <dd className="text-text-primary">{t(`providers.${m.provider}`)}</dd>
                      </div>
                    </dl>
                    {m.last_error && (
                      <Alert variant="destructive" className="text-xs">{m.last_error}</Alert>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end sm:shrink-0">
                    {m.status === "pending_otp" && m.otp_token && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => copyLink(m.otp_token!)} aria-label={t("copyLink")}>
                          {copied === m.otp_token ? <Check aria-hidden="true" className="h-4 w-4 text-success" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                          {t("copyLink")}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => shareWhatsApp(m.otp_token!)}>
                          <MessageSquare aria-hidden="true" className="h-4 w-4" />
                          {t("shareWhatsApp")}
                        </Button>
                        <Button size="sm" variant="ghost" loading={busy} onClick={() => act(m.id, "resend_otp")}>
                          <RefreshCw aria-hidden="true" className="h-4 w-4" />
                          {t("resendOtp")}
                        </Button>
                      </>
                    )}
                    {m.status === "active" && (
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => act(m.id, "collect")}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {t("collectNow")}
                      </Button>
                    )}
                    {["pending_otp", "active", "suspended"].includes(m.status) && (
                      <Button size="sm" variant="ghost" loading={busy} onClick={() => act(m.id, "cancel")} className="text-destructive">
                        <Ban aria-hidden="true" className="h-4 w-4" />
                        {t("cancel")}
                      </Button>
                    )}
                  </div>
                </div>

                {cols.length > 0 && (
                  <div className="border-t border-border/40">
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="px-4">{t("collections.date")}</TableHead>
                            <TableHead className="px-4 text-end">{t("collections.amount")}</TableHead>
                            <TableHead className="px-4">{t("collections.status")}</TableHead>
                            <TableHead className="px-4">{t("collections.reference")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cols.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="px-4 font-mono ltr-nums text-xs">{c.scheduled_date}</TableCell>
                              <TableCell className="px-4 font-mono ltr-nums text-xs text-end">{money(c.amount)}</TableCell>
                              <TableCell className="px-4">
                                <Badge variant={COLLECTION_VARIANTS[c.status] ?? "secondary"}>{t(`collectionStatus.${c.status}`)}</Badge>
                                {c.failure_reason && <span className="ms-2 text-xs text-text-secondary">{c.failure_reason}</span>}
                              </TableCell>
                              <TableCell className="px-4 font-mono ltr-nums text-xs text-text-secondary">{c.provider_collection_id ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <ul className="md:hidden divide-y divide-border/40">
                      {cols.map((c) => (
                        <li key={c.id} className="p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-mono ltr-nums text-xs text-text-secondary">{c.scheduled_date}</div>
                            <div className="mt-1"><Badge variant={COLLECTION_VARIANTS[c.status] ?? "secondary"}>{t(`collectionStatus.${c.status}`)}</Badge></div>
                            {c.failure_reason && <div className="mt-1 text-xs text-text-secondary">{c.failure_reason}</div>}
                          </div>
                          <div className="font-mono ltr-nums text-sm text-end">{money(c.amount)}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("setUp")}</DialogTitle>
            <DialogDescription>{t("dialogDescription", { name: tenantName })}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {created ? (
              <div className="space-y-4">
                <Alert variant="success">{created.status === "active" ? t("createdActive") : t("createdPendingOtp")}</Alert>
                {created.otp_token && (
                  <>
                    <div className="rounded-lg border border-border/60 bg-surface-elevated p-3 text-xs font-mono ltr-nums break-all">
                      {otpLink(created.otp_token)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => copyLink(created.otp_token!)}>
                        {copied === created.otp_token ? <Check aria-hidden="true" className="h-4 w-4 text-success" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                        {t("copyLink")}
                      </Button>
                      <Button size="sm" onClick={() => shareWhatsApp(created.otp_token!)}>
                        <MessageSquare aria-hidden="true" className="h-4 w-4" />
                        {t("shareWhatsApp")}
                      </Button>
                    </div>
                    <p className="text-xs text-text-secondary flex items-center gap-1.5">
                      <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                      {t("otpLinkExpiry")}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <form id="e-mandate-form" onSubmit={submit} className="space-y-4">
                {formError && <Alert variant="destructive">{formError}</Alert>}
                <Select label={t("fields.lease")} value={leaseId} onChange={(e) => selectLease(e.target.value)} required>
                  {eligibleLeases.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </Select>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={`${t("fields.amount")} (${CURRENCY.code})`}
                    type="number"
                    min="0.001"
                    step="0.001"
                    inputMode="decimal"
                    className="font-mono ltr-nums"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                  <Input
                    label={t("fields.collectionDay")}
                    type="number"
                    min={1}
                    max={28}
                    inputMode="numeric"
                    className="font-mono ltr-nums"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    helperText={t("fields.collectionDayHelp")}
                    required
                  />
                </div>
                <Input label={t("fields.debtorName")} value={debtorName} onChange={(e) => setDebtorName(e.target.value)} />
                <Input
                  label={t("fields.accountNumber")}
                  className="font-mono ltr-nums"
                  autoComplete="off"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  helperText={t("fields.accountNumberHelp")}
                  required
                />
                <Input
                  label={t("fields.bankCode")}
                  className="font-mono ltr-nums"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  helperText={t("fields.bankCodeHelp")}
                />
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            {created ? (
              <Button variant="secondary" onClick={() => setOpen(false)}>{tc("close")}</Button>
            ) : (
              <>
                <Button variant="ghost" type="button" onClick={() => setOpen(false)} disabled={submitting}>{tc("cancel")}</Button>
                <Button type="submit" form="e-mandate-form" loading={submitting}>{t("createAtBank")}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
