"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Landmark } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Staff: one-time catch-up that reads the lease agreements already uploaded
// for tenants and records the municipality contracts among them, then lists
// what was recorded and what was skipped.

type Result = {
  checked: number;
  imported: { file_name: string; tenant: string; unit: string; contract_number: string; end_date: string }[];
  skipped: { file_name: string; tenant: string; reason: string }[];
};

export function ImportMunicipalityContractsButton() {
  const t = useTranslations("municipalityContract.import");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/municipality-contracts/import", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: t("failed"), variant: "destructive" });
      } else {
        setResult(body as Result);
        router.refresh();
      }
    } catch {
      toast({ title: t("failed"), variant: "destructive" });
    }
    setRunning(false);
  }

  return (
    <>
      <Button type="button" variant="outline" className="rounded-xl" onClick={() => setConfirmOpen(true)}>
        <Landmark aria-hidden="true" className="h-4 w-4" />
        {t("button")}
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (running) return;
          setConfirmOpen(next);
          if (!next) setResult(null);
        }}
      >
        <DialogContent maxWidth="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{result ? t("summary", { checked: result.checked, imported: result.imported.length }) : t("description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-4 space-y-4">
            {result ? (
              <>
                {result.imported.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal mb-2">{t("imported")}</h3>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {result.imported.map((r) => (
                        <li key={r.file_name + r.contract_number} className="px-3 py-2 text-sm">
                          <p className="text-text-primary">
                            {r.tenant} · {r.unit}
                          </p>
                          <p className="text-xs text-text-secondary tabular-nums ltr-nums">
                            {r.contract_number} · {t("until", { date: new Date(r.end_date).toLocaleDateString() })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.skipped.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold whitespace-nowrap text-text-secondary uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal mb-2">{t("skipped")}</h3>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {result.skipped.map((r, i) => (
                        <li key={r.file_name + i} className="px-3 py-2 text-sm">
                          <p className="text-text-primary truncate">
                            {r.tenant} · <span className="text-text-secondary">{r.file_name}</span>
                          </p>
                          <p className="text-xs text-warning">{t(`reasons.${r.reason}` as "reasons.failed")}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button type="button" onClick={() => setConfirmOpen(false)}>
                    {tc("close")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" disabled={running} onClick={() => setConfirmOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button type="button" loading={running} onClick={run}>
                  {running ? t("running") : t("start")}
                </Button>
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
