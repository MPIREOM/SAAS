"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, PackagePlus, ClipboardCheck } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";

// Spare gate keys for one building (migration 054). Keys sold through the
// "lost / extra gate key" violation come out automatically; super admins
// add bought keys or correct the count here.

export interface GateKeyMovement {
  id: string;
  kind: "restock" | "count" | "sale";
  quantity: number;
  balanceAfter: number;
  createdAt: string;
  notes: string | null;
  unitNumber: string | null;
  tenantName: string | null;
}

type Mode = "restock" | "count";

export function GateKeyStockCard({
  propertyId,
  stock,
  threshold,
  movements,
  canManage,
}: {
  propertyId: string;
  stock: number | null;
  threshold: number;
  movements: GateKeyMovement[];
  canManage: boolean;
}) {
  const t = useTranslations("properties.gateKeys");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  const tracked = stock !== null;
  const low = tracked && stock <= threshold;

  function openDialog(next: Mode) {
    setQuantity(next === "count" && tracked ? String(stock) : "");
    setMode(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mode) return;
    const qty = parseInt(quantity, 10);
    if (!(qty >= (mode === "restock" ? 1 : 0))) {
      toast({ title: t("quantityRequired"), variant: "destructive" });
      return;
    }
    const notes = ((new FormData(e.currentTarget).get("notes") as string) || "").trim();
    setSaving(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/gate-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: mode, quantity: qty, notes: notes || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: res.status === 403 ? t("forbidden") : body.error || t("failed"), variant: "destructive" });
      } else {
        toast({ title: t("saved", { stock: body.stock }), variant: "success" });
        setMode(null);
        router.refresh();
      }
    } catch {
      toast({ title: t("failed"), variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-lg", low ? "bg-warning-tint" : "bg-accent-tint")}>
            <KeyRound aria-hidden="true" className={cn("h-4 w-4", low ? "text-warning" : "text-accent")} />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => openDialog("count")}>
              <ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" />
              {tracked ? t("correctCount") : t("setCount")}
            </Button>
            {tracked && (
              <Button size="sm" onClick={() => openDialog("restock")}>
                <PackagePlus aria-hidden="true" className="h-3.5 w-3.5" />
                {t("addKeys")}
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {tracked ? (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-[12.5px] font-medium text-text-secondary mb-0.5">{t("inStock")}</p>
              <p
                className={cn(
                  "text-3xl font-bold tabular-nums ltr-nums",
                  stock < 0 ? "text-destructive" : low ? "text-warning" : "text-text-primary"
                )}
              >
                {stock}
              </p>
            </div>
            <div className="pb-1.5 flex items-center gap-2">
              <Badge variant={low ? "warning" : "success"}>{low ? t("low") : t("ok")}</Badge>
              <span className="text-xs text-text-secondary">
                {t("reorderLevel")}: <span className="tabular-nums ltr-nums">{threshold}</span>
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{canManage ? t("notTrackedAdmin") : t("notTracked")}</p>
        )}

        {low && <Alert variant="warning">{t("lowAlert", { stock: stock ?? 0, threshold })}</Alert>}

        {movements.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-[0.06em] rtl:normal-case rtl:tracking-normal mb-2">{t("history")}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {movements.map((m) => {
                const detail =
                  m.kind === "sale"
                    ? [m.unitNumber && t("unit", { unit: m.unitNumber }), m.tenantName].filter(Boolean).join(" · ")
                    : m.notes;
                return (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-text-primary">{t(`kinds.${m.kind}`)}</p>
                      <p className="text-xs text-text-secondary truncate">
                        <span className="tabular-nums ltr-nums">
                          {new Date(m.createdAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            timeZone: "Asia/Muscat",
                          })}
                        </span>
                        {detail ? ` · ${detail}` : ""}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p
                        className={cn(
                          "tabular-nums ltr-nums font-semibold",
                          m.quantity < 0 ? "text-destructive" : m.quantity > 0 ? "text-success" : "text-text-secondary"
                        )}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {t("balance")}: <span className="tabular-nums ltr-nums">{m.balanceAfter}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "restock" ? t("addKeys") : tracked ? t("correctCount") : t("setCount")}</DialogTitle>
            <DialogDescription>{mode === "restock" ? t("restockDescription") : t("countDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="number"
                min={mode === "restock" ? 1 : 0}
                max={10000}
                step={1}
                inputMode="numeric"
                required
                autoFocus
                label={mode === "restock" ? t("keysBought") : t("keysCounted")}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="tabular-nums ltr-nums tabular-nums"
              />
              {mode === "restock" && tracked && Number(quantity) > 0 && (
                <p className="text-xs text-text-secondary">
                  {t("newTotal")}: <span className="tabular-nums ltr-nums">{(stock ?? 0) + Number(quantity)}</span>
                </p>
              )}
              <Textarea name="notes" rows={2} maxLength={500} label={t("notes")} placeholder={t("notesPlaceholder")} />
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setMode(null)}>
                  {tc("cancel")}
                </Button>
                <Button type="submit" loading={saving}>
                  {tc("save")}
                </Button>
              </div>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
