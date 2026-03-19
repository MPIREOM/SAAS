"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, FileText } from "lucide-react";

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
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

    // Insert document record — store the storage path for signed URL generation
    const { error: insertError } = await supabase.from("documents").insert({
      entity_type: entityType,
      entity_id: selectedEntityId,
      document_type: formData.get("document_type") as string,
      file_url: filePath,
      file_name: file.name,
      expiry_date: (formData.get("expiry_date") as string) || null,
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
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary font-display">
          {t("upload")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* File Upload */}
        <div className="bg-surface border border-border rounded-lg p-6">
          {file ? (
            <div className="relative">
              {filePreview ? (
                <img
                  src={filePreview}
                  alt="Preview"
                  className="w-full max-h-48 object-contain rounded-md border border-border"
                />
              ) : (
                <div className="w-full h-32 rounded-md border border-border bg-surface-elevated flex flex-col items-center justify-center gap-2">
                  <FileText className="h-10 w-10 text-text-secondary/50" />
                  <span className="text-sm text-text-secondary">{file.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={clearFile}
                className="absolute top-2 right-2 h-6 w-6 bg-surface/80 backdrop-blur-sm border border-border rounded-full flex items-center justify-center hover:bg-surface transition-colors"
              >
                <X className="h-3 w-3 text-text-secondary" />
              </button>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-accent/50 transition-colors"
            >
              <Upload className="h-8 w-8 text-text-secondary/50 mx-auto mb-2" />
              <p className="text-sm text-text-secondary">
                {tc("dragAndDrop")}
              </p>
              <p className="text-xs text-text-secondary/70 mt-1">
                {tc("or")}{" "}
                <span className="text-accent underline">{tc("browseFiles")}</span>
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
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("documentType")} <span className="text-destructive">*</span>
            </label>
            <select
              name="document_type"
              required
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              {documentTypes.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          {prefilled ? (
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {entityType === "tenant" ? (tc("tenant") || "Tenant") : (tc("property") || "Property")}
              </label>
              <div className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 flex items-center text-sm text-text-primary">
                {prefilledLabel || entityId}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t("entityType")} <span className="text-destructive">*</span>
                </label>
                <select
                  value={entityType}
                  onChange={(e) => {
                    setEntityType(e.target.value as "tenant" | "property");
                    setEntityId("");
                  }}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="tenant">{tc("tenant") || "Tenant"}</option>
                  <option value="property">{tc("property") || "Property"}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {entityType === "tenant" ? (tc("tenant") || "Tenant") : (tc("property") || "Property")}{" "}
                  <span className="text-destructive">*</span>
                </label>
                <select
                  name="entity_id"
                  required
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="">--</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("expiryDate")}
            </label>
            <input
              name="expiry_date"
              type="date"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !file}
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? tc("loading") : t("upload")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
