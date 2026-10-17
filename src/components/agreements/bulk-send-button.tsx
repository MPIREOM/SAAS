"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileSignature } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Staff: send the building-rules agreement to every current tenant who
// hasn't been sent one yet (tenants registered before the feature existed).

export function BulkSendAgreementsButton() {
  const t = useTranslations("tenantAgreement.bulk");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch("/api/agreements/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: body.error || t("failed"), variant: "destructive" });
      } else {
        toast({
          title: t("result", { sent: body.sent, already: body.already_done, failed: body.failed }),
          variant: body.failed > 0 ? "destructive" : "success",
        });
        setOpen(false);
        router.refresh();
      }
    } catch {
      toast({ title: t("failed"), variant: "destructive" });
    }
    setBusy(false);
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <FileSignature aria-hidden="true" className="h-4 w-4" />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-2">
            <p className="text-sm text-text-secondary">{t("note")}</p>
          </DialogBody>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={send} loading={busy}>
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
