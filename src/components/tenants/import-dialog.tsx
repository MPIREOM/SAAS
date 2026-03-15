"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

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
        setError(data.error || "Failed to parse file");
        return;
      }

      setPreviewData(data.tenants);
      setValidationErrors(data.errors || []);
      setMappedColumns(data.mappedColumns || []);
      setTotalRows(data.totalRows);
      setValidRows(data.validRows);
      setStep("preview");
    } catch {
      setError("Failed to process file. Please check the format and try again.");
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
        setError(data.error || "Import failed");
        setStep("preview");
        return;
      }

      setImportedCount(data.imported);
      setStep("done");
      router.refresh();
    } catch {
      setError("Import failed. Please try again.");
      setStep("preview");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-surface border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">
              {t("importTenants")}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-surface-elevated transition-colors"
          >
            <X className="h-4 w-4 text-text-secondary" />
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

              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-accent/50 transition-colors"
              >
                <Upload className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
                <p className="text-sm text-text-secondary">
                  {tc("dragAndDrop")}
                </p>
                <p className="text-xs text-text-secondary/70 mt-1">
                  {tc("or")}{" "}
                  <span className="text-accent underline">
                    {tc("browseFiles")}
                  </span>
                </p>
                <p className="text-xs text-text-secondary/50 mt-2">
                  .xlsx, .xls, .csv
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Expected format */}
              <div className="bg-surface-elevated border border-border rounded-md p-4">
                <p className="text-xs font-medium text-text-primary mb-2">
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
                    <span
                      key={col}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        col.includes("*")
                          ? "bg-accent/10 text-accent"
                          : "bg-border/30 text-text-secondary"
                      }`}
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-text-secondary" />
                  <span className="text-text-secondary">{file?.name}</span>
                </div>
                <div className="flex items-center gap-3 ml-auto text-xs">
                  <span className="text-text-secondary">
                    {totalRows} {t("totalRows")}
                  </span>
                  <span className="text-success">
                    {validRows} {t("validRows")}
                  </span>
                  {validationErrors.length > 0 && (
                    <span className="text-destructive">
                      {validationErrors.length} {t("errorRows")}
                    </span>
                  )}
                </div>
              </div>

              {/* Column mapping */}
              {mappedColumns.length > 0 && (
                <div className="bg-surface-elevated border border-border rounded-md p-3">
                  <p className="text-xs font-medium text-text-primary mb-2">
                    {t("columnMapping")}
                  </p>
                  <div className="flex flex-wrap gap-2">
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
                <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3">
                  <p className="text-xs font-medium text-destructive mb-2">
                    {t("importErrors")}
                  </p>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {validationErrors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive/80">
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview table */}
              <div className="border border-border rounded-md overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full min-w-[500px]">
                  <thead className="sticky top-0">
                    <tr className="bg-surface-elevated border-b border-border">
                      <th className="text-start text-xs font-medium text-text-secondary px-3 py-2">
                        #
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary px-3 py-2">
                        {t("fullName")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary px-3 py-2">
                        {t("phone")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary px-3 py-2">
                        {t("email")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary px-3 py-2">
                        {t("nationality")}
                      </th>
                      <th className="text-start text-xs font-medium text-text-secondary px-3 py-2">
                        {t("nationalId")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.slice(0, 50).map((tenant, i) => (
                      <tr
                        key={i}
                        className="hover:bg-surface-elevated/50 transition-colors"
                      >
                        <td className="px-3 py-2 text-xs text-text-secondary">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2 text-sm text-text-primary">
                          {tenant.full_name}
                        </td>
                        <td className="px-3 py-2 text-sm text-text-secondary font-mono">
                          {tenant.phone}
                        </td>
                        <td className="px-3 py-2 text-sm text-text-secondary">
                          {tenant.email || "—"}
                        </td>
                        <td className="px-3 py-2 text-sm text-text-secondary">
                          {tenant.nationality || "—"}
                        </td>
                        <td className="px-3 py-2 text-sm text-text-secondary font-mono">
                          {tenant.national_id || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length > 50 && (
                <p className="text-xs text-text-secondary text-center">
                  {t("showingFirst50", { total: previewData.length })}
                </p>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Importing Step */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-accent animate-spin mb-4" />
              <p className="text-sm text-text-primary">{t("importingTenants")}</p>
              <p className="text-xs text-text-secondary mt-1">
                {t("importingCount", { count: validRows })}
              </p>
            </div>
          )}

          {/* Done Step */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="h-10 w-10 text-success mb-4" />
              <p className="text-base font-medium text-text-primary">
                {t("importSuccess")}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {t("importedCount", { count: importedCount })}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          {step === "upload" && (
            <button
              onClick={handleClose}
              className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
            >
              {tc("cancel")}
            </button>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={reset}
                className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
              >
                {tc("back")}
              </button>
              <button
                onClick={handleImport}
                disabled={validRows === 0}
                className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {t("importCount", { count: validRows })}
              </button>
            </>
          )}

          {step === "done" && (
            <button
              onClick={handleClose}
              className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
            >
              {tc("done")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
