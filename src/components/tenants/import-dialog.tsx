"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Upload, X, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface PreviewTenant {
  full_name: string;
  phone: string;
  email?: string;
  nationality?: string;
  national_id?: string;
  emergency_contact?: string;
  language_preference?: string;
}

interface ValidationError {
  row: number;
  message: string;
}

interface MappedColumn {
  original: string;
  mapped: string;
}

type Step = "upload" | "preview" | "importing" | "done";

export function ImportTenantsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [previewData, setPreviewData] = useState<PreviewTenant[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [mappedColumns, setMappedColumns] = useState<MappedColumn[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [validRows, setValidRows] = useState(0);
  const [importedCount, setImportedCount] = useState(0);

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setError("");
    setPreviewData([]);
    setValidationErrors([]);
    setMappedColumns([]);
    setTotalRows(0);
    setValidRows(0);
    setImportedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setError("");
    setStep("upload");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("mode", "preview");

    try {
      const res = await fetch("/api/tenants/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("importParseFailed"));
        return;
      }

      setPreviewData(data.tenants);
      setValidationErrors(data.errors || []);
      setMappedColumns(data.mappedColumns || []);
      setTotalRows(data.totalRows);
      setValidRows(data.validRows);
      setStep("preview");
    } catch {
      setError(t("importProcessFailed"));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setStep("importing");
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", "import");

    try {
      const res = await fetch("/api/tenants/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("importFailed"));
        setStep("preview");
        return;
      }

      setImportedCount(data.imported);
      setStep("done");
      router.refresh();
    } catch {
      setError(t("importFailedRetry"));
      setStep("preview");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-tenants-title"
        className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border/60 bg-surface shadow-2xl shadow-black/20 animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-6 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden="true" />
            </span>
            <h2
              id="import-tenants-title"
              className="truncate font-display text-lg font-semibold tracking-tight text-text-primary"
            >
              {t("importTenants")}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={tc("close")}
            className="rounded-lg p-1.5 text-text-secondary transition-all duration-200 hover:bg-surface-elevated hover:text-text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Upload Step */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                {t("importDescription")}
              </p>

              <button
                type="button"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-border/60 p-10 text-center cursor-pointer transition-all duration-200 hover:border-accent/50 hover:bg-surface-elevated/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Upload
                  className="mx-auto mb-3 h-10 w-10 text-text-secondary/40"
                  aria-hidden="true"
                />
                <p className="text-sm text-text-secondary">
                  {tc("dragAndDrop")}
                </p>
                <p className="mt-1 text-xs text-text-secondary/70">
                  {tc("or")}{" "}
                  <span className="text-accent underline underline-offset-2">
                    {tc("browseFiles")}
                  </span>
                </p>
                <p className="mt-2 text-xs font-mono text-text-secondary/50">
                  .xlsx, .xls, .csv
                </p>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={handleFileChange}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />

              {/* Expected format */}
              <div className="rounded-xl border border-border/40 bg-surface-elevated/50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {t("expectedColumns")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Full Name *",
                    "Phone *",
                    "Email",
                    "Nationality",
                    "ID Number",
                    "Emergency Contact",
                    "Language",
                  ].map((col) => (
                    <Badge
                      key={col}
                      variant={col.includes("*") ? "default" : "secondary"}
                    >
                      {col}
                    </Badge>
                  ))}
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="animate-fade-in-up">
                  {error}
                </Alert>
              )}
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <FileSpreadsheet
                    className="h-4 w-4 shrink-0 text-text-secondary"
                    aria-hidden="true"
                  />
                  <span className="truncate text-text-secondary">{file?.name}</span>
                </div>
                <div className="ms-auto flex items-center gap-1.5">
                  <Badge variant="secondary">
                    <span className="font-mono tabular-nums ltr-nums">{totalRows}</span>
                    &nbsp;{t("totalRows")}
                  </Badge>
                  <Badge variant="success">
                    <span className="font-mono tabular-nums ltr-nums">{validRows}</span>
                    &nbsp;{t("validRows")}
                  </Badge>
                  {validationErrors.length > 0 && (
                    <Badge variant="destructive">
                      <span className="font-mono tabular-nums ltr-nums">
                        {validationErrors.length}
                      </span>
                      &nbsp;{t("errorRows")}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Column mapping */}
              {mappedColumns.length > 0 && (
                <div className="rounded-xl border border-border/40 bg-surface-elevated/50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    {t("columnMapping")}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {mappedColumns.map((col) => (
                      <span
                        key={col.original}
                        className="text-xs text-text-secondary"
                      >
                        <span className="text-text-primary">{col.original}</span>
                        {" → "}
                        <span className="text-accent">{col.mapped}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <Alert variant="destructive" title={t("importErrors")}>
                  <div className="max-h-24 space-y-1 overflow-y-auto">
                    {validationErrors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive/80">
                        {t("importRow", { row: err.row, message: err.message })}
                      </p>
                    ))}
                  </div>
                </Alert>
              )}

              {/* Preview table */}
              <div className="overflow-hidden rounded-xl border border-border/40 [&>div]:max-h-64">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>{t("fullName")}</TableHead>
                      <TableHead>{t("phone")}</TableHead>
                      <TableHead>{t("email")}</TableHead>
                      <TableHead>{t("nationality")}</TableHead>
                      <TableHead>{t("nationalId")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(0, 50).map((tenant, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono tabular-nums ltr-nums text-text-secondary">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium text-text-primary">
                          {tenant.full_name}
                        </TableCell>
                        <TableCell className="font-mono ltr-nums text-text-secondary">
                          {tenant.phone}
                        </TableCell>
                        <TableCell className="text-text-secondary">
                          {tenant.email || "—"}
                        </TableCell>
                        <TableCell className="text-text-secondary">
                          {tenant.nationality || "—"}
                        </TableCell>
                        <TableCell className="font-mono ltr-nums text-text-secondary">
                          {tenant.national_id || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {previewData.length > 50 && (
                <p className="text-center text-xs text-text-secondary">
                  {t("showingFirst50", { total: previewData.length })}
                </p>
              )}

              {error && (
                <Alert variant="destructive" className="animate-fade-in-up">
                  {error}
                </Alert>
              )}
            </div>
          )}

          {/* Importing Step */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Spinner
                sizeClassName="h-8 w-8"
                label={t("importingTenants")}
                className="mb-4"
              />
              <p className="text-sm font-medium text-text-primary">
                {t("importingTenants")}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {t("importingCount", { count: validRows })}
              </p>
            </div>
          )}

          {/* Done Step */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-12 animate-fade-in-up">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 border border-success/25">
                <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
              </span>
              <p className="font-display text-base font-semibold text-text-primary">
                {t("importSuccess")}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {t("importedCount", { count: importedCount })}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border/40 px-6 py-4">
          {step === "upload" && (
            <Button type="button" variant="secondary" onClick={handleClose}>
              {tc("cancel")}
            </Button>
          )}

          {step === "preview" && (
            <>
              <Button type="button" variant="secondary" onClick={reset}>
                {tc("back")}
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={validRows === 0}
              >
                {t("importCount", { count: validRows })}
              </Button>
            </>
          )}

          {step === "done" && (
            <Button type="button" onClick={handleClose}>
              {tc("done")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
