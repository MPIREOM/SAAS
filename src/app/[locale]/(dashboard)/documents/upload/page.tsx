"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, FileText, Sparkles, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// Document types that typically have expiry dates
const EXPIRY_TYPES = new Set([
  "lease_agreement",
  "id_copy",
  "passport",
  "visa",
  "insurance",
  "permit",
  "noc",
]);

export default function UploadDocumentPage() {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<"tenant" | "property">(
    (searchParams.get("entityType") as "tenant" | "property") || "tenant"
  );
  const [entityId, setEntityId] = useState(searchParams.get("entityId") || "");
  const [tenants, setTenants] = useState<{ id: string; full_name: string }[]>([]);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [documentType, setDocumentType] = useState("lease_agreement");
  const [expiryDate, setExpiryDate] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [autoExtracted, setAutoExtracted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-filled from URL params (e.g., from unit detail page)
  const prefilled = Boolean(searchParams.get("entityId"));

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("tenants").select("id, full_name").order("full_name"),
        supabase.from("properties").select("id, name").order("name"),
      ]);
      if (t) setTenants(t);
      if (p) setProperties(p);
    };
    load();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
  };

  const selectFile = (f: File) => {
    setFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setFilePreview(null);
    }

    // Auto-extract expiry if document type supports it
    if (EXPIRY_TYPES.has(documentType)) {
      extractExpiry(f, documentType);
    }
  };

  const clearFile = () => {
    setFile(null);
    setFilePreview(null);
    setAutoExtracted(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const extractExpiry = async (targetFile: File, docType: string) => {
    setExtracting(true);
    setAutoExtracted(false);

    try {
      const formData = new FormData();
      formData.append("file", targetFile);
      formData.append("document_type", docType);

      const res = await fetch("/api/extract-expiry", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.expiry_date) {
          setExpiryDate(data.expiry_date);
          setAutoExtracted(true);
        }
      }
    } catch {
      // Non-critical — user can still enter manually
    } finally {
      setExtracting(false);
    }
  };

  // Re-extract when document type changes and file is already selected
  const handleDocumentTypeChange = (newType: string) => {
    setDocumentType(newType);
    if (file && EXPIRY_TYPES.has(newType) && !extracting) {
      extractExpiry(file, newType);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const selectedEntityId = entityId || (formData.get("entity_id") as string);

    if (!selectedEntityId) {
      setError(tc("required"));
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Upload file to Supabase Storage
    const ext = file.name.split(".").pop();
    const filePath = `documents/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file);

    if (uploadError) {
      setError(uploadError.message);
      setLoading(false);
      return;
    }

    // Insert document record
    const { error: insertError } = await supabase.from("documents").insert({
      entity_type: entityType,
      entity_id: selectedEntityId,
      document_type: documentType,
      file_url: filePath,
      file_name: file.name,
      expiry_date: expiryDate || null,
      uploaded_by: user?.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.back();
    router.refresh();
  };

  const documentTypes = [
    { value: "lease_agreement", label: t("types.leaseAgreement") },
    { value: "id_copy", label: t("types.idCopy") },
    { value: "passport", label: t("types.passport") },
    { value: "visa", label: t("types.visa") },
    { value: "noc", label: t("types.noc") },
    { value: "title_deed", label: t("types.titleDeed") },
    { value: "permit", label: t("types.permit") },
    { value: "insurance", label: t("types.insurance") },
    { value: "custom", label: t("types.custom") },
  ];

  const entities = entityType === "tenant"
    ? tenants.map((t) => ({ id: t.id, label: t.full_name }))
    : properties.map((p) => ({ id: p.id, label: p.name }));

  // Find the display name for the pre-filled entity
  const prefilledLabel = prefilled
    ? entities.find((e) => e.id === entityId)?.label
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t("upload")} description={t("subtitle")} />

      <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up">
        {/* File Upload */}
        <div className="rounded-xl border border-border/60 bg-surface p-6">
          {file ? (
            <div className="relative">
              {filePreview ? (
                <img
                  src={filePreview}
                  alt={file.name}
                  className="w-full max-h-48 rounded-lg border border-border/60 object-contain"
                />
              ) : (
                <div className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-border/60 bg-surface-elevated">
                  <FileText aria-hidden="true" className="h-10 w-10 text-text-secondary/50" />
                  <span className="max-w-full truncate px-4 text-sm text-text-secondary">
                    {file.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={clearFile}
                aria-label={tc("close")}
                className="absolute top-2 end-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/80 backdrop-blur-sm transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <X className="h-3 w-3 text-text-secondary" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) selectFile(f); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
              className="cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-accent/50 hover:bg-surface-elevated/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 border border-accent/15">
                <Upload className="h-5 w-5 text-accent" aria-hidden="true" />
              </div>
              <p className="text-sm text-text-secondary">
                {tc("dragAndDrop")}
              </p>
              <p className="mt-1 text-xs text-text-secondary/70">
                {tc("or")}{" "}
                <span className="font-medium text-accent underline underline-offset-2">
                  {tc("browseFiles")}
                </span>
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.doc,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Document Details */}
        <div className="rounded-xl border border-border/60 bg-surface p-6 space-y-5">
          <Select
            name="document_type"
            required
            value={documentType}
            onChange={(e) => handleDocumentTypeChange(e.target.value)}
            label={`${t("documentType")} *`}
          >
            {documentTypes.map((dt) => (
              <option key={dt.value} value={dt.value}>
                {dt.label}
              </option>
            ))}
          </Select>

          {prefilled ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground tracking-tight">
                {entityType === "tenant" ? tc("tenant") : tc("property")}
              </span>
              <div className="flex h-10 w-full items-center rounded-lg border border-border/60 bg-surface-elevated/50 px-3 text-sm text-text-primary">
                {prefilledLabel || entityId}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value as "tenant" | "property");
                  setEntityId("");
                }}
                label={`${t("entityType")} *`}
              >
                <option value="tenant">{tc("tenant")}</option>
                <option value="property">{tc("property")}</option>
              </Select>

              <Select
                name="entity_id"
                required
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                label={`${entityType === "tenant" ? tc("tenant") : tc("property")} *`}
              >
                <option value="">--</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Input
              name="expiry_date"
              type="date"
              value={expiryDate}
              onChange={(e) => { setExpiryDate(e.target.value); setAutoExtracted(false); }}
              label={t("expiryDate")}
              className="font-mono ltr-nums"
            />
            {extracting && (
              <p className="flex items-center gap-1.5 text-xs text-accent" role="status">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {t("extractingExpiry")}
              </p>
            )}
            {autoExtracted && !extracting && (
              <p className="flex items-center gap-1.5 text-xs text-success" role="status">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {t("expiryExtracted")}
              </p>
            )}
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={loading} disabled={loading || !file}>
            {!loading && <Upload aria-hidden="true" className="h-4 w-4" />}
            {t("upload")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
