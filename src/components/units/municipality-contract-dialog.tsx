"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";

// Staff: record the municipality-registered rent contract for the unit's
// current tenant. Picking the PDF reads the reference number and period
// off it; staff check them and save.

const ERRORS = ["pdf_required", "file_too_large", "no_active_tenant", "invalid_input"] as const;

export function MunicipalityContractDialog({ unitId }: { unitId: string }) {
  const t = useTranslations("municipalityContract");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [contractNumber, setContractNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function reset() {
    setFile(null);
    setContractNumber("");
    setStartDate("");
    setEndDate("");
    setAutoFilled(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(f: File | null) {
    setFile(f);
    setAutoFilled(false);
    if (!f) return;
    setExtracting(true);
    try {
      const body = new FormData();
      body.append("file", f);
      const res = await fetch("/api/municipality-contracts/extract", { method: "POST", body });
      if (res.ok) {
        const data = await res.json();
        if (data.contract_number) setContractNumber(data.contract_number);
        if (data.start_date) setStartDate(data.start_date);
        if (data.end_date) setEndDate(data.end_date);
        setAutoFilled(!!(data.contract_number || data.start_date || data.end_date));
      }
    } catch {
      // Non-critical — staff can still type the details
    }
    setExtracting(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      toast({ title: t("pdfRequired"), variant: "destructive" });
      return;
    }
    if (endDate < startDate) {
      toast({ title: t("invalidPeriod"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append("unit_id", unitId);
      body.append("contract_number", contractNumber.trim());
      body.append("start_date", startDate);
      body.append("end_date", endDate);
      body.append("file", file);
      const res = await fetch("/api/municipality-contracts", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const known = ERRORS.includes(data.error) ? (data.error as (typeof ERRORS)[number]) : null;
        toast({ title: known ? t(`errors.${known}`) : t("failed"), variant: "destructive" });
      } else {
        toast({ title: t("saved"), variant: "success" });
        setOpen(false);
        reset();
        router.refresh();
      }
    } catch {
      toast({ title: t("failed"), variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonVariants({ size: "sm" })}
      >
        <FileUp aria-hidden="true" className="h-3.5 w-3.5" />
        {t("add")}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("add")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="municipality-contract-file" className="block text-sm font-medium text-text-primary mb-1.5">
                  {t("pdf")}
                </label>
                <input
                  id="municipality-contract-file"
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-text-secondary file:me-3 file:rounded-lg file:border-0 file:bg-accent-tint file:px-3 file:py-2 file:text-xs file:font-semibold file:text-accent hover:file:bg-accent/20"
                />
                {extracting ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary">
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    {t("reading")}
                  </p>
                ) : autoFilled ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
                    <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                    {t("autoFilled")}
                  </p>
                ) : null}
              </div>
              <Input
                required
                maxLength={100}
                label={t("number")}
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                placeholder="36854/2026"
                className="tabular-nums ltr-nums"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  type="date"
                  required
                  label={t("startDate")}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="tabular-nums ltr-nums"
                />
                <Input
                  type="date"
                  required
                  min={startDate || undefined}
                  label={t("endDate")}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="tabular-nums ltr-nums"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button type="submit" loading={saving} disabled={extracting}>
                  {tc("save")}
                </Button>
              </div>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
