'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FileText, AlertCircle, Clock, CheckCircle2, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';

type PaymentMethod = 'bank_transfer' | 'cheque';

interface PaymentForm {
  method: PaymentMethod;
  reference_number: string;
  cheque_number: string;
  bank_name: string;
  cheque_date: string;
}

interface TenantCheque {
  id: string;
  cheque_number: string;
  bank_name: string;
  cheque_date: string;
  amount: number;
  notes: string | null;
}

interface Invoice {
  id: string;
  amount: string;
  due_date: string;
  period_start: string;
  period_end: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paid_date: string | null;
  tenants: { id: string; full_name: string; phone: string };
  units: { unit_number: string; properties: { name: string } };
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  overdue: 'bg-destructive/10 text-destructive',
  paid: 'bg-success/10 text-success',
  cancelled: 'bg-text-secondary/10 text-text-secondary',
};

const FILTERS = ['all', 'overdue', 'pending', 'paid'] as const;
type Filter = (typeof FILTERS)[number];

export default function InvoicesPage() {
  const { locale } = useParams<{ locale: string }>();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [generating, setGenerating] = useState(false);

  // Payment dialog state
  const [dialogInvoice, setDialogInvoice] = useState<Invoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PaymentForm>({
    method: 'bank_transfer',
    reference_number: '',
    cheque_number: '',
    bank_name: '',
    cheque_date: format(new Date(), 'yyyy-MM-dd'),
  });

  // Registered cheques for the selected tenant
  const [tenantCheques, setTenantCheques] = useState<TenantCheque[]>([]);
  const [loadingCheques, setLoadingCheques] = useState(false);
  const [selectedChequeId, setSelectedChequeId] = useState<string>('');

  const openDialog = (inv: Invoice) => {
    setForm({
      method: 'bank_transfer',
      reference_number: '',
      cheque_number: '',
      bank_name: '',
      cheque_date: format(new Date(), 'yyyy-MM-dd'),
    });
    setTenantCheques([]);
    setSelectedChequeId('');
    setDialogInvoice(inv);
  };

  const fetchTenantCheques = async (tenantId: string) => {
    setLoadingCheques(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/cheques`);
      const data = await res.json();
      const pending = (data.cheques || []).filter((c: TenantCheque & { status: string }) => c.status === 'pending');
      setTenantCheques(pending);
    } finally {
      setLoadingCheques(false);
    }
  };

  const selectCheque = (chequeId: string) => {
    setSelectedChequeId(chequeId);
    if (!chequeId) {
      setForm((f) => ({ ...f, cheque_number: '', bank_name: '', cheque_date: format(new Date(), 'yyyy-MM-dd') }));
      return;
    }
    const cheque = tenantCheques.find((c) => c.id === chequeId);
    if (cheque) {
      setForm((f) => ({
        ...f,
        cheque_number: cheque.cheque_number,
        bank_name: cheque.bank_name,
        cheque_date: cheque.cheque_date,
      }));
    }
  };

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices');
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const generateInvoices = async () => {
    setGenerating(true);
    try {
      await fetch('/api/cron/invoices', { method: 'POST' });
      await fetchInvoices();
    } finally {
      setGenerating(false);
    }
  };

  const confirmPayment = async () => {
    if (!dialogInvoice) return;
    if (form.method === 'cheque' && (!form.cheque_number || !form.bank_name || !form.cheque_date)) return;

    setSubmitting(true);
    try {
      await fetch(`/api/invoices/${dialogInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          payment_method: form.method,
          reference_number: form.reference_number || undefined,
          cheque_number: form.cheque_number || undefined,
          bank_name: form.bank_name || undefined,
          cheque_date: form.cheque_date || undefined,
        }),
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === dialogInvoice.id
            ? { ...inv, status: 'paid', paid_date: format(new Date(), 'yyyy-MM-dd') }
            : inv
        )
      );
      setDialogInvoice(null);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = invoices.filter((inv) =>
    filter === 'all' ? true : inv.status === filter
  );

  const stats = {
    overdue: invoices.filter((i) => i.status === 'overdue'),
    pending: invoices.filter((i) => i.status === 'pending'),
    paid: invoices.filter((i) => i.status === 'paid'),
  };

  const sum = (list: Invoice[]) =>
    list.reduce((acc, i) => acc + parseFloat(i.amount), 0).toFixed(2);

  const formatPeriod = (start: string) => {
    try {
      return format(parseISO(start), 'MMM yyyy');
    } catch {
      return start;
    }
  };

  const formatDate = (d: string) => {
    try {
      return format(parseISO(d), 'dd MMM yyyy');
    } catch {
      return d;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Invoices</h1>
          <p className="text-sm text-text-secondary mt-1">
            Automated rent invoices and payment tracking
          </p>
        </div>
        <button
          onClick={generateInvoices}
          disabled={generating}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating...' : 'Generate This Month'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Overdue</p>
              <p className="text-xl font-bold text-text-primary">{stats.overdue.length}</p>
            </div>
          </div>
          <p className="text-xs text-destructive mt-2 font-mono">{sum(stats.overdue)} OMR</p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Pending</p>
              <p className="text-xl font-bold text-text-primary">{stats.pending.length}</p>
            </div>
          </div>
          <p className="text-xs text-warning mt-2 font-mono">{sum(stats.pending)} OMR</p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-xs text-text-secondary">Paid</p>
              <p className="text-xl font-bold text-text-primary">{stats.paid.length}</p>
            </div>
          </div>
          <p className="text-xs text-success mt-2 font-mono">{sum(stats.paid)} OMR</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-surface-elevated rounded-lg w-fit">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
              filter === f
                ? 'bg-surface text-text-primary shadow-sm font-medium'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {f}
            {f !== 'all' && (
              <span className="ml-1.5 text-xs opacity-60">
                {stats[f as keyof typeof stats]?.length ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b border-border animate-pulse">
              <div className="h-4 bg-surface-elevated rounded w-32" />
              <div className="h-4 bg-surface-elevated rounded w-20" />
              <div className="h-4 bg-surface-elevated rounded w-24" />
              <div className="h-4 bg-surface-elevated rounded w-16 ml-auto" />
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border">
                {['Tenant', 'Unit / Property', 'Period', 'Amount', 'Due Date', 'Status', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-4 py-3">
                    <a
                      href={`/${locale}/tenants/${inv.tenants?.id}`}
                      className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
                    >
                      {inv.tenants?.full_name}
                    </a>
                    <p className="text-xs text-text-secondary font-mono ltr-nums mt-0.5">
                      {inv.tenants?.phone}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-primary font-mono">
                      {inv.units?.unit_number}
                    </span>
                    <p className="text-xs text-text-secondary mt-0.5">
                      {inv.units?.properties?.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-secondary">
                      {formatPeriod(inv.period_start)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono font-medium text-text-primary ltr-nums">
                      {parseFloat(inv.amount).toFixed(2)} OMR
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-mono ltr-nums ${
                        inv.status === 'overdue' ? 'text-destructive font-medium' : 'text-text-secondary'
                      }`}
                    >
                      {formatDate(inv.due_date)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[inv.status]}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(inv.status === 'pending' || inv.status === 'overdue') && (
                      <button
                        onClick={() => openDialog(inv)}
                        className="text-xs px-3 py-1 bg-success/10 hover:bg-success/20 text-success rounded-md transition-colors"
                      >
                        Mark Paid
                      </button>
                    )}
                    {inv.status === 'paid' && inv.paid_date && (
                      <span className="text-xs text-text-secondary font-mono ltr-nums">
                        {formatDate(inv.paid_date)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <FileText className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
          <h3 className="text-base font-medium text-text-primary mb-1">No invoices found</h3>
          <p className="text-sm text-text-secondary mb-4">
            Click &quot;Generate This Month&quot; to create invoices for all active leases.
          </p>
        </div>
      )}

      {/* Mark as Paid dialog */}
      <Dialog open={!!dialogInvoice} onOpenChange={(open) => !open && setDialogInvoice(null)}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            {dialogInvoice && (
              <p className="text-sm text-text-secondary mt-1">
                {dialogInvoice.tenants?.full_name} — {parseFloat(dialogInvoice.amount).toFixed(2)} OMR
              </p>
            )}
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* Payment method */}
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['bank_transfer', 'cheque'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, method: m, cheque_number: '', bank_name: '', cheque_date: format(new Date(), 'yyyy-MM-dd') }));
                      setSelectedChequeId('');
                      if (m === 'cheque' && dialogInvoice?.tenants?.id) {
                        fetchTenantCheques(dialogInvoice.tenants.id);
                      }
                    }}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      form.method === m
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-text-secondary hover:border-accent/50'
                    }`}
                  >
                    {m === 'bank_transfer' ? 'Bank Transfer' : 'Cheque'}
                  </button>
                ))}
              </div>
            </div>

            {/* Bank transfer fields */}
            {form.method === 'bank_transfer' && (
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1.5">
                  Reference Number <span className="normal-case opacity-60">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.reference_number}
                  onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))}
                  placeholder="e.g. TXN-2026-001"
                  className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
            )}

            {/* Cheque fields */}
            {form.method === 'cheque' && (
              <div className="space-y-3">
                {/* Registered cheque selector */}
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1.5">
                    Registered Cheque
                  </label>
                  {loadingCheques ? (
                    <div className="h-9 flex items-center px-3 rounded-md border border-border bg-surface text-sm text-text-secondary">
                      Loading cheques...
                    </div>
                  ) : tenantCheques.length > 0 ? (
                    <select
                      value={selectedChequeId}
                      onChange={(e) => selectCheque(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                    >
                      <option value="">— Enter manually —</option>
                      {tenantCheques.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.cheque_number} · {c.bank_name} · {c.cheque_date} · {c.amount} OMR
                          {c.notes ? ` · ${c.notes}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="h-9 flex items-center px-3 rounded-md border border-border bg-surface-elevated text-sm text-text-secondary">
                      No pending cheques registered for this tenant
                    </div>
                  )}
                </div>

                {/* Manual entry fields — shown when no cheque selected or no registered cheques */}
                <div className={selectedChequeId ? 'opacity-50 pointer-events-none' : ''}>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1.5">
                        Cheque Number <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.cheque_number}
                        onChange={(e) => setForm((f) => ({ ...f, cheque_number: e.target.value }))}
                        placeholder="e.g. 000123"
                        className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1.5">
                        Bank Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.bank_name}
                        onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                        placeholder="e.g. Bank Muscat"
                        className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1.5">
                        Cheque Date <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="date"
                        value={form.cheque_date}
                        onChange={(e) => setForm((f) => ({ ...f, cheque_date: e.target.value }))}
                        className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setDialogInvoice(null)}
              className="h-9 px-4 text-sm text-text-secondary hover:text-text-primary border border-border rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPayment}
              disabled={
                submitting ||
                (form.method === 'cheque' && (!form.cheque_number || !form.bank_name || !form.cheque_date))
              }
              className="h-9 px-4 text-sm bg-accent hover:bg-accent-hover text-background font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : 'Confirm Payment'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
