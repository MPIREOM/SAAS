import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { FolderOpen, AlertTriangle, Upload } from "lucide-react";

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page } = await searchParams;
  const t = await getTranslations("documents");
  const supabase = await createClient();

  // Property-level access control
  const propertyIds = await getUserAccessiblePropertyIds(supabase);

  // Pagination
  const PAGE_SIZE = 50;
  const currentPage = Math.max(1, parseInt(page || "1", 10));

  // Get total count for pagination
  let countQuery = supabase
    .from("documents")
    .select("*", { count: "exact", head: true });
  if (propertyIds !== null) {
    countQuery = countQuery.in("property_id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
  }
  const { count: totalCount } = await countQuery;
  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

  let docsQuery = supabase
    .from("documents")
    .select(`
      *,
      tenants:tenant_id(full_name),
      properties:property_id(name)
    `)
    .order("created_at", { ascending: false });
  if (propertyIds !== null) {
    docsQuery = docsQuery.in("property_id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
  }
  const { data: documents } = await docsQuery
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

  const typeColors: Record<string, string> = {
    lease: "bg-accent/10 text-accent",
    id: "bg-warning/10 text-warning",
    contract: "bg-success/10 text-success",
    invoice: "bg-text-secondary/10 text-text-secondary",
    receipt: "bg-text-secondary/10 text-text-secondary",
    other: "bg-text-secondary/10 text-text-secondary",
  };

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-display">
            {t("title")}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href={`/${locale}/documents/upload`}
          className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98]"
        >
          <Upload className="h-4 w-4" />
          {t("upload")}
        </Link>
      </div>

      {documents && documents.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto animate-fade-in">
          <table className="w-full min-w-[600px] mobile-card-view">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("documentName")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("documentType")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("entity")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("expiryDate")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("uploaded")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((doc: Record<string, unknown>) => {
                const tenant = doc.tenants as Record<string, unknown> | null;
                const property = doc.properties as Record<string, unknown> | null;
                const expiryDate = doc.expiry_date
                  ? new Date(doc.expiry_date as string)
                  : null;
                const isExpiringSoon =
                  expiryDate && expiryDate <= thirtyDaysFromNow && expiryDate >= now;
                const isExpired = expiryDate && expiryDate < now;

                return (
                  <tr
                    key={doc.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-text-primary">
                        {doc.name as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          typeColors[(doc.document_type as string) || "other"]
                        }`}
                      >
                        {doc.document_type as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {tenant
                          ? (tenant.full_name as string)
                          : property
                          ? (property.name as string)
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-mono ltr-nums ${
                            isExpired
                              ? "text-destructive"
                              : isExpiringSoon
                              ? "text-warning"
                              : "text-text-secondary"
                          }`}
                        >
                          {expiryDate
                            ? expiryDate.toLocaleDateString()
                            : "—"}
                        </span>
                        {(isExpiringSoon || isExpired) && (
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary font-mono ltr-nums">
                        {new Date(doc.created_at as string).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl={`/${locale}/documents`}
            searchParams={{}}
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-16 text-center">
          <div className="p-3 bg-accent/10 rounded-2xl w-fit mx-auto mb-3">
            <FolderOpen className="h-8 w-8 text-accent/50" />
          </div>
          <h3 className="text-base font-medium text-text-primary mb-1 font-display">
            {t("noDocuments")}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {t("noDocumentsDescription")}
          </p>
          <Link
            href={`/${locale}/documents/upload`}
            className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98]"
          >
            <Upload className="h-4 w-4" />
            {t("upload")}
          </Link>
        </div>
      )}
    </div>
  );
}
