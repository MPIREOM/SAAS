"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ScrollText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StatementOfAccountButtonProps {
  unitId: string;
}

export function StatementOfAccountButton({ unitId }: StatementOfAccountButtonProps) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function handleGenerate() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    window.open(
      `/api/units/${unitId}/statement${query ? `?${query}` : ""}`,
      "_blank",
      "noopener"
    );
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-8 px-3 bg-surface-elevated border border-border/60 text-text-secondary text-xs font-medium rounded-lg hover:border-accent/30 hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        title={t("statementOfAccountDescription")}
      >
        <ScrollText aria-hidden="true" className="h-3.5 w-3.5" />
        {t("statementOfAccount")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("statementOfAccount")}</DialogTitle>
            <DialogDescription>{t("statementRangeHint")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                type="month"
                label={t("statementFrom")}
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="ltr-nums"
              />
              <Input
                type="month"
                label={t("statementTo")}
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="ltr-nums"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleGenerate}>
              <ScrollText aria-hidden="true" className="h-4 w-4" />
              {t("generateStatement")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
