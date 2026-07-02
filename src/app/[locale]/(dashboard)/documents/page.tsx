import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  FolderOpen,
  AlertTriangle,
  Clock,
  CheckCircle,
  ExternalLink,
  Upload,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileGeneric,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

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

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "bmp"]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "csv"]);
const TEXT_EXTENSIONS = new Set(["pdf", "doc", "docx", "txt", "rtf"]);

function getFileIcon(fileName: string | null) {
  const ext = fileName?.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(ext)) return FileImage;
  if (SPREADSHEET_EXTENSIONS.has(ext)) return FileSpreadsheet;
  if (TEXT_EXTENSIONS.has(ext)) return FileText;
  return FileGeneric;
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
  const tc = await getTranslations("common");
  const tShared = await getTranslations("tenants");
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

  const entityTypeLabel = (entityType: string) =>
    entityType === "tenant"
      ? tc("tenant")
      : entityType === "property"
        ? tc("property")
        : entityType;

  const summaryCards = [
    {
      key: "expired",
      count: expiredCount,
      label: t("expired"),
      icon: AlertTriangle,
      border: "border-destructive/20",
      iconBg: "bg-destructive/10",
      text: "text-destructive",
    },
    {
      key: "expiringSoon",
      count: expiringSoonCount,
      label: t("expiringSoon"),
      icon: Clock,
      border: "border-warning/20",
      iconBg: "bg-warning/10",
      text: "text-warning",
    },
    {
      key: "valid",
      count: validCount,
      label: t("valid"),
      icon: CheckCircle,
      border: "border-success/20",
      iconBg: "bg-success/10",
      text: "text-success",
    },
  ];

  const filters = [
    { key: null, label: tShared("all") },
    { key: "expired", label: t("expired"), count: expiredCount, color: "text-destructive bg-destructive/10" },
    { key: "expiringSoon", label: t("expiringSoon"), count: expiringSoonCount, color: "text-warning bg-warning/10" },
    { key: "valid", label: t("valid"), count: validCount, color: "text-success bg-success/10" },
  ];

  const uploadCta = (
    <Link
      href={`/${locale}/documents/upload`}
      className={cn(buttonVariants({ variant: "default" }), "rounded-xl")}
    >
      <Upload aria-hidden="true" className="h-4 w-4" />
      {t("uploadDocument")}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")}>
        {uploadCta}
      </PageHeader>

      {/* Expiry Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className={`flex items-center gap-3 rounded-xl border bg-surface p-4 ${card.border}`}
            >
              <div className={`rounded-lg p-2 ${card.iconBg}`}>
                <Icon aria-hidden="true" className={`h-5 w-5 ${card.text}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold font-mono ltr-nums ${card.text}`}>
                  {card.count}
                </p>
                <p className="text-xs text-text-secondary">{card.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map((f) => {
          const isActive = filter === f.key || (!filter && !f.key);
          return (
            <Link
              key={f.key || "all"}
              href={f.key ? `/${locale}/documents?filter=${f.key}` : `/${locale}/documents`}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                isActive
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "bg-surface border-border/50 text-text-secondary hover:text-text-primary hover:border-border"
              }`}
            >
              {f.label}
              {f.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ltr-nums ${f.color || ""}`}>
                  {f.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Documents Table */}
      {filteredDocs.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" />}
          title={t("noDocuments")}
          description={t("noDocumentsDescription")}
          action={uploadCta}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-surface animate-fade-in-up">
          {/* Desktop table — hidden on mobile in favor of card list below */}
          <div className="hidden md:block">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">{t("documentType")}</TableHead>
                  <TableHead className="px-4">{t("entity")}</TableHead>
                  <TableHead className="px-4">{t("fileName")}</TableHead>
                  <TableHead className="px-4">{t("expiryDate")}</TableHead>
                  <TableHead className="px-4">{t("uploaded")}</TableHead>
                  <TableHead className="w-14 px-4 text-end">
                    <span className="sr-only">{tc("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocs.map((doc) => {
                  const expiryStatus = getExpiryStatus(doc.expiry_date);
                  const expiryVariant: "success" | "warning" | "destructive" =
                    expiryStatus === "expired"
                      ? "destructive"
                      : expiryStatus === "expiringSoon"
                      ? "warning"
                      : "success";
                  const FileIcon = getFileIcon(doc.file_name);
                  return (
                    <TableRow
                      key={doc.id}
                      className={expiryStatus === "expired" ? "bg-destructive/5" : ""}
                    >
                      <TableCell className="px-4">
                        <Badge variant="default">
                          {t(`types.${documentTypeMap[doc.document_type] || "custom"}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4">
                        <p className="text-sm font-medium text-text-primary">{doc.entityName}</p>
                        <p className="text-xs text-text-secondary">
                          {entityTypeLabel(doc.entity_type)}
                        </p>
                      </TableCell>
                      <TableCell className="px-4">
                        <span className="flex items-center gap-2 text-xs text-text-secondary">
                          <FileIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-accent/70" />
                          <span className="max-w-[200px] truncate">{doc.file_name || "—"}</span>
                        </span>
                      </TableCell>
                      <TableCell className="px-4">
                        {doc.expiry_date ? (
                          <Badge variant={expiryVariant} className="font-mono ltr-nums">
                            {format(new Date(doc.expiry_date), "dd MMM yyyy")}
                          </Badge>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 whitespace-nowrap font-mono text-xs text-text-secondary ltr-nums">
                        {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="px-4 text-end">
                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("preview")}
                            className="inline-flex h-8 min-w-8 items-center justify-center rounded-md text-accent hover:text-accent-hover hover:bg-accent/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                          >
                            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <ul className="md:hidden divide-y divide-border/30">
            {filteredDocs.map((doc) => {
              const expiryStatus = getExpiryStatus(doc.expiry_date);
              const expiryVariant: "success" | "warning" | "destructive" =
                expiryStatus === "expired"
                  ? "destructive"
                  : expiryStatus === "expiringSoon"
                  ? "warning"
                  : "success";
              const FileIcon = getFileIcon(doc.file_name);
              return (
                <li
                  key={`m-${doc.id}`}
                  className={`p-4 ${expiryStatus === "expired" ? "bg-destructive/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <FileIcon aria-hidden="true" className="h-4 w-4 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {doc.entityName}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {entityTypeLabel(doc.entity_type)}
                        </p>
                      </div>
                    </div>
                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t("preview")}
                        className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-border/50 text-text-secondary hover:text-accent hover:border-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Badge variant="default">
                      {t(`types.${documentTypeMap[doc.document_type] || "custom"}`)}
                    </Badge>
                    {doc.expiry_date && (
                      <Badge variant={expiryVariant} className="font-mono ltr-nums">
                        {format(new Date(doc.expiry_date), "dd MMM yyyy")}
                      </Badge>
                    )}
                  </div>
                  {doc.file_name && (
                    <p className="mt-2 truncate text-xs text-text-secondary">
                      {doc.file_name}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-border/40">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                baseUrl={`/${locale}/documents`}
                searchParams={filter ? { filter } : {}}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
