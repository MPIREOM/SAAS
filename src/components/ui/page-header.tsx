import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Shared page header used at the top of every dashboard page.
 *
 * Slots:
 * - title:       large h1 (required)
 * - description: small muted text under the title
 * - breadcrumbs: array of { label, href? } — last item is rendered as plain text
 * - children:    action area on the right (buttons, filters, etc.)
 *
 * Responsive: stacks vertically below `sm`, side-by-side from `sm` upward.
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "animate-fade-in-up flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs items={breadcrumbs} />
        )}
        <h1 className="text-2xl font-bold tracking-tight text-text-primary font-display">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-2 flex items-center gap-1 text-xs text-text-secondary"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${idx}`}>
            {idx > 0 && (
              <ChevronRight
                aria-hidden="true"
                className="h-3 w-3 text-text-secondary/60 rtl:rotate-180"
              />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="rounded transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(isLast && "font-medium text-text-primary")}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
