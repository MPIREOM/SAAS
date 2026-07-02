"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

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
      <div className="flex items-center gap-1">
        <span className="text-sm text-text-secondary">
          {currentMethod ? t(`methods.${currentMethod}`) : "—"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
          aria-label={tc("edit")}
          title={tc("edit")}
          className="h-6 w-6 p-0 text-text-secondary hover:text-accent"
        >
          <Pencil aria-hidden="true" className="h-3 w-3" />
        </Button>
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
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={selected}
        onChange={(e) => setSelected(e.target.value as PaymentMethod)}
        disabled={pending}
        aria-label={t("method")}
        className="h-7 w-auto rounded-md px-2 py-0 pe-7 text-xs"
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {t(`methods.${m}`)}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={save}
        disabled={pending}
        aria-label={tc("save")}
        title={tc("save")}
        className="h-7 w-7 p-0 text-success hover:bg-success/10 hover:text-success"
      >
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setSelected(currentMethod ?? "cash");
          setEditing(false);
          setError(null);
        }}
        disabled={pending}
        aria-label={tc("cancel")}
        title={tc("cancel")}
        className="h-7 w-7 p-0 text-text-secondary hover:text-text-primary"
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
      {error && (
        <span role="alert" className="text-[11px] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
