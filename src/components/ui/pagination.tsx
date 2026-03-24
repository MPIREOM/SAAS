import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
  searchParams?: Record<string, string>;
}

export function Pagination({
  currentPage,
  totalPages,
  baseUrl,
  searchParams = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const buildUrl = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    return `${baseUrl}?${params.toString()}`;
  };

  // Show at most 5 page buttons
  let startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  const pages = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage + i
  );

  const linkClass =
    "h-8 w-8 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 py-4">
      {/* Previous */}
      {currentPage > 1 ? (
        <Link
          href={buildUrl(currentPage - 1)}
          aria-label="Previous page"
          className={cn(linkClass, "text-text-secondary hover:text-text-primary hover:bg-surface-elevated")}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      ) : (
        <span className={cn(linkClass, "text-text-secondary/30")} aria-hidden="true">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </span>
      )}

      {/* Page numbers */}
      {startPage > 1 && (
        <>
          <Link
            href={buildUrl(1)}
            aria-label="Page 1"
            className={cn(linkClass, "text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated")}
          >
            1
          </Link>
          {startPage > 2 && (
            <span className="text-text-secondary/40 text-sm px-1" aria-hidden="true">...</span>
          )}
        </>
      )}

      {pages.map((page) => (
        <Link
          key={page}
          href={buildUrl(page)}
          aria-label={`Page ${page}`}
          aria-current={page === currentPage ? "page" : undefined}
          className={cn(
            linkClass,
            "text-sm font-medium",
            page === currentPage
              ? "bg-accent text-background"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
          )}
        >
          {page}
        </Link>
      ))}

      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && (
            <span className="text-text-secondary/40 text-sm px-1" aria-hidden="true">...</span>
          )}
          <Link
            href={buildUrl(totalPages)}
            aria-label={`Page ${totalPages}`}
            className={cn(linkClass, "text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated")}
          >
            {totalPages}
          </Link>
        </>
      )}

      {/* Next */}
      {currentPage < totalPages ? (
        <Link
          href={buildUrl(currentPage + 1)}
          aria-label="Next page"
          className={cn(linkClass, "text-text-secondary hover:text-text-primary hover:bg-surface-elevated")}
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      ) : (
        <span className={cn(linkClass, "text-text-secondary/30")} aria-hidden="true">
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </span>
      )}
    </nav>
  );
}
