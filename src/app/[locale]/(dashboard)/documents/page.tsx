import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FolderOpen, AlertTriangle, Clock, CheckCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface Document {
  id: string;
  entity_type: string;
  entity_id: string;
  document_type: string;
  file_url: string;
  file_name: string | null;
  expiry_date: string | null;
  uploaded_at: string;
  entityName?: string;
}

function getExpiryStatus(expiryDate: string | null): "expired" | "expiringSoon" | "valid" | null {
  if (!expiryDate) return null;
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiringSoon";
  return "valid";
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { filter, page: pageParam } = await searchParams;
  const t = await getTranslations("documents");
  const currentPage = parseInt(pageParam || "1");
  const pageSize = 50;

  const supabase = await createClient();

  // Fetch all documents
  const { data: documents, count } = await supabase
    .from("documents")
    .select("*", { count: "exact" })
    .order("uploaded_at", { ascending: false })
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  // Fetch entity names (tenants and properties)
  const docs = documents || [];
  const tenantIds = docs.filter(d => d.entity_type === "tenant").map(d => d.entity_id);
  const propertyIds = docs.filter(d => d.entity_type === "property").map(d => d.entity_id);

  const { data: tenants } = tenantIds.length > 0
    ? await supabase.from("tenants").select("id, full_name").in("id", tenantIds)
    : { data: [] };

  const { data: properties } = propertyIds.length > 0
    ? await supabase.from("properties").select("id, name").in("id", propertyIds)
    : { data: [] };

  const entityMap = new Map<string, string>();
  (tenants || []).forEach(t => entityMap.set(t.id, t.full_name));
  (properties || []).forEach(p => entityMap.set(p.id, p.name));

  const enrichedDocs: Document[] = docs.map(d => ({
    ...d,
    entityName: entityMap.get(d.entity_id) || d.entity_id,
  }));

  // Filter by expiry status
  const filteredDocs = filter
    ? enrichedDocs.filter(d => getExpiryStatus(d.expiry_date) === filter)
    : enrichedDocs;

  // Count by expiry status
  const expiredCount = enrichedDocs.filter(d => getExpiryStatus(d.expiry_date) === "expired").length;
  const expiringSoonCount = enrichedDocs.filter(d => getExpiryStatus(d.expiry_date) === "expiringSoon").length;
  const validCount = enrichedDocs.filter(d => getExpiryStatus(d.expiry_date) === "valid").length;

  const totalPages = Math.ceil((count || 0) / pageSize);

  const documentTypeMap: Record<string, string> = {
    lease_agreement: "leaseAgreement",
    id_copy: "idCopy",
    passport: "passport",
    visa: "visa",
    noc: "noc",
    title_deed: "titleDeed",
    permit: "permit",
    insurance: "insurance",
    custom: "custom",
  };

  const filters = [
    { key: null, label: "All" },
    { key: "expired", label: t("expired"), count: expiredCount, color: "text-destructive bg-destructive/10" },
    { key: "expiringSoon", label: t("expiringSoon"), count: expiringSoonCount, color: "text-warning bg-warning/10" },
    { key: "valid", label: t("valid"), count: validCount, color: "text-success bg-success/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-display font-bold text-text-primary tracking-tight">{t("title")}</h1>
        <p className="text-sm text-text-secondary mt-1">{t("subtitle")}</p>
      </div>

      {/* Expiry Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-destructive/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-destructive/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-destructive">{expiredCount}</p>
            <p className="text-xs text-text-secondary">{t("expired")}</p>
          </div>
        </div>
        <div className="bg-surface border border-warning/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-warning/10 rounded-lg">
            <Clock className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-warning">{expiringSoonCount}</p>
            <p className="text-xs text-text-secondary">{t("expiringSoon")}</p>
          </div>
        </div>
        <div className="bg-surface border border-success/20 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-success/10 rounded-lg">
            <CheckCircle className="h-5 w-5 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-success">{validCount}</p>
            <p className="text-xs text-text-secondary">{t("valid")}</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map((f) => (
          <Link
            key={f.key || "all"}
            href={f.key ? `/${locale}/documents?filter=${f.key}` : `/${locale}/documents`}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors border ${
              filter === f.key || (!filter && !f.key)
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-surface border-border/50 text-text-secondary hover:text-text-primary hover:border-border"
            }`}
          >
            {f.label}
            {f.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${f.color || ""}`}>
                {f.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Documents Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <div className="h-14 w-14 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
              <FolderOpen className="h-6 w-6 opacity-40" />
            </div>
            <p className="text-sm font-medium">{t("noDocuments")}</p>
            <p className="text-xs mt-1">{t("noDocumentsDescription")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/30">
                  <th className="text-start text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">{t("documentType")}</th>
                  <th className="text-start text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">{t("entity")}</th>
                  <th className="text-start text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">{t("fileName")}</th>
                  <th className="text-start text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">{t("expiryDate")}</th>
                  <th className="text-start text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4">{t("uploaded")}</th>
                  <th className="text-center text-[11px] text-text-secondary uppercase tracking-widest font-semibold py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => {
                  const expiryStatus = getExpiryStatus(doc.expiry_date);
                  return (
                    <tr key={doc.id} className="border-b border-border/20 hover:bg-surface-elevated/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-xs font-medium bg-accent/10 text-accent px-2 py-1 rounded-md">
                          {t(`types.${documentTypeMap[doc.document_type] || "custom"}`)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm text-text-primary font-medium">{doc.entityName}</p>
                          <p className="text-xs text-text-secondary capitalize">{doc.entity_type}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-xs truncate max-w-[200px]">
                        {doc.file_name || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {doc.expiry_date ? (
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            expiryStatus === "expired"
                              ? "bg-destructive/10 text-destructive"
                              : expiryStatus === "expiringSoon"
                              ? "bg-warning/10 text-warning"
                              : "bg-success/10 text-success"
                          }`}>
                            {format(new Date(doc.expiry_date), "dd MMM yyyy")}
                          </span>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-text-secondary font-mono">
                        {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <Link
              href={`/${locale}/documents?page=${Math.max(1, currentPage - 1)}${filter ? `&filter=${filter}` : ""}`}
              className={`text-xs px-3 py-1.5 rounded-md border ${
                currentPage <= 1 ? "opacity-50 pointer-events-none border-border/30 text-text-secondary" : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              Previous
            </Link>
            <span className="text-xs text-text-secondary">
              Page {currentPage} of {totalPages}
            </span>
            <Link
              href={`/${locale}/documents?page=${Math.min(totalPages, currentPage + 1)}${filter ? `&filter=${filter}` : ""}`}
              className={`text-xs px-3 py-1.5 rounded-md border ${
                currentPage >= totalPages ? "opacity-50 pointer-events-none border-border/30 text-text-secondary" : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              Next
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
