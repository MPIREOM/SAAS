import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
        "flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1 sm:basis-64">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs items={breadcrumbs} />
        )}
        <h1 className="text-[22px] font-bold leading-tight text-text-primary font-display sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {children}
        </div>
      )}
    </div>
  );
}

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const t = useTranslations("common");
  return (
    <nav
      aria-label={t("breadcrumb")}
      className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-text-secondary"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${idx}`}>
            {idx > 0 && (
              <ChevronRight
                aria-hidden="true"
                className="h-3.5 w-3.5 text-text-tertiary rtl:rotate-180"
              />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="rounded transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
