"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Folder, Upload, Trash2, Download, X, FileText, AlertCircle } from "lucide-react";

interface Document {
  id: string;
  document_type: string;
  file_name: string | null;
  expiry_date: string | null;
  uploaded_at: string;
}

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "lease_agreement",     label: "Lease Agreement" },
  { value: "id_copy",             label: "ID Copy" },
  { value: "visa",                label: "Visa" },
  { value: "noc",                 label: "No Objection Certificate (NOC)" },
  { value: "title_deed",          label: "Title Deed" },
  { value: "permit",              label: "Permit" },
  { value: "insurance",           label: "Insurance" },
  { value: "salary_certificate",  label: "Salary Certificate" },
  { value: "bank_statement",      label: "Bank Statement" },
  { value: "tenancy_contract",    label: "Tenancy Contract" },
  { value: "utility_bill",        label: "Utility Bill" },
  { value: "internal_agreement",  label: "Internal Agreement" },
  { value: "custom",              label: "Custom" },
];

export default function TenantDocuments({ tenantId }: { tenantId: string }) {
  const t = useTranslations("tenants");
  const td = useTranslations("documents");
  const tc = useTranslations("common");

  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [docType, setDocType] = useState("id_copy");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/documents`);
    const data = await res.json();
    setDocs(data.documents || []);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [tenantId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError("");

    const form = new FormData();
    form.append("file", file);
    form.append("document_type", docType);
    if (expiryDate) form.append("expiry_date", expiryDate);

    const res = await fetch(`/api/tenants/${tenantId}/documents`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const data = await res.json();
      setUploadError(data.error || tc("error"));
      setUploading(false);
      return;
    }

    setShowUpload(false);
    setFile(null);
    setExpiryDate("");
    setDocType("id_copy");
    if (fileRef.current) fileRef.current.value = "";
    await fetchDocs();
    setUploading(false);
  };

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    await fetch(`/api/tenants/${tenantId}/documents/${docId}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== docId));
    setDeletingId(null);
  };

  const handleDownload = async (docId: string, fileName: string | null) => {
    setDownloadingId(docId);
    const res = await fetch(`/api/tenants/${tenantId}/documents/${docId}`);
    const data = await res.json();
    if (data.url) {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = fileName || "document";
      a.target = "_blank";
      a.click();
    }
    setDownloadingId(null);
  };

  const isExpiringSoon = (expiry: string | null) => {
    if (!expiry) return false;
    const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 30;
  };

  const isExpired = (expiry: string | null) => {
    if (!expiry) return false;
    return new Date(expiry) < new Date();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
          <Folder className="h-5 w-5 text-text-secondary" />
          {t("documents")}
        </h2>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
        >
          <Upload className="h-4 w-4" />
          {td("upload")}
        </button>
      </div>

      {loading ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : docs.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {td("fileName")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {td("documentType")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {td("expiryDate")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {td("uploadDate")}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-text-secondary shrink-0" />
                      <span className="text-sm text-text-primary truncate max-w-[180px]">
                        {doc.file_name || "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-secondary">
                      {DOC_TYPES.find((t) => t.value === doc.document_type)?.label ?? doc.document_type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {doc.expiry_date ? (
                      <span className={`text-sm font-mono ltr-nums flex items-center gap-1.5 ${
                        isExpired(doc.expiry_date)
                          ? "text-destructive"
                          : isExpiringSoon(doc.expiry_date)
                          ? "text-warning"
                          : "text-text-primary"
                      }`}>
                        {isExpired(doc.expiry_date) || isExpiringSoon(doc.expiry_date) ? (
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        ) : null}
                        {new Date(doc.expiry_date).toLocaleDateString()}
                        {isExpired(doc.expiry_date) && (
                          <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                            {td("expired")}
                          </span>
                        )}
                        {!isExpired(doc.expiry_date) && isExpiringSoon(doc.expiry_date) && (
                          <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                            {td("expiringSoon")}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-secondary font-mono ltr-nums">
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleDownload(doc.id, doc.file_name)}
                        disabled={downloadingId === doc.id}
                        className="p-1.5 text-text-secondary hover:text-accent transition-colors disabled:opacity-50"
                        title={td("download")}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                        className="p-1.5 text-text-secondary hover:text-destructive transition-colors disabled:opacity-50"
                        title={tc("delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <Folder className="h-8 w-8 text-text-secondary/40 mx-auto mb-2" />
          <p className="text-sm text-text-secondary mb-3">{t("noDocuments")}</p>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Upload className="h-4 w-4" />
            {td("upload")}
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">{td("upload")}</h2>
              <button
                onClick={() => { setShowUpload(false); setUploadError(""); }}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {td("documentType")} <span className="text-destructive">*</span>
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  {DOC_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {tc("uploadFile")} <span className="text-destructive">*</span>
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-text-primary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-surface-elevated file:text-text-primary hover:file:bg-border/40 file:cursor-pointer cursor-pointer"
                />
                <p className="text-xs text-text-secondary mt-1">PDF, JPG, PNG — max 50MB</p>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {td("expiryDate")} <span className="text-text-secondary text-xs">({tc("optional")})</span>
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
                />
              </div>

              {uploadError && (
                <p className="text-sm text-destructive">{uploadError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setUploadError(""); }}
                  disabled={uploading}
                  className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors disabled:opacity-50"
                >
                  {tc("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {uploading ? tc("loading") : td("upload")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
