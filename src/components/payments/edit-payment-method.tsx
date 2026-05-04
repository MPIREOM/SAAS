"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Pencil, X } from "lucide-react";

const METHODS = ["cash", "bank_transfer", "cheque"] as const;
type PaymentMethod = (typeof METHODS)[number];

interface Props {
  paymentId: string;
  currentMethod: PaymentMethod | null;
}

export function EditPaymentMethod({ paymentId, currentMethod }: Props) {
  const router = useRouter();
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<PaymentMethod>(
    currentMethod ?? "cash",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-text-secondary">
          {currentMethod ? t(`methods.${currentMethod}`) : "—"}
        </span>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
          aria-label="Edit payment method"
          className="text-text-secondary hover:text-text-primary transition-colors p-0.5"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const save = async () => {
    setError(null);
    if (selected === currentMethod) {
      setEditing(false);
      return;
    }
    try {
      const res = await fetch(`/api/payments/${paymentId}/method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: selected }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? `Update failed (${res.status})`);
        return;
      }
      startTransition(() => {
        setEditing(false);
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as PaymentMethod)}
        disabled={pending}
        className="h-7 bg-surface-elevated border border-border rounded px-2 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors"
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {t(`methods.${m}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        aria-label={tc("save")}
        className="p-0.5 text-success hover:text-success/80 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setSelected(currentMethod ?? "cash");
          setEditing(false);
          setError(null);
        }}
        disabled={pending}
        aria-label={tc("cancel")}
        className="p-0.5 text-text-secondary hover:text-text-primary disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {error && (
        <span className="text-[10px] text-destructive ms-1">{error}</span>
      )}
    </div>
  );
}
