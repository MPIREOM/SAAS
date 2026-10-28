"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils/cn";

const STATUS_OPTIONS = ["all", "active", "archived"] as const;

export function TenantsFilter() {
  const t = useTranslations("tenants");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentStatus = searchParams.get("status") || "active";
  const currentSearch = searchParams.get("search") || "";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [searchParams, pathname, router]
  );

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      {/* Search bar */}
      <div className="relative flex-1 w-full sm:max-w-[420px]">
        <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
        <input
          type="search"
          defaultValue={currentSearch}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          onChange={(e) => updateParams({ search: e.target.value })}
          className="w-full h-[42px] ps-9 pe-3 bg-surface border border-border-strong rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:border-accent transition-colors"
        />
      </div>

      {/* Status filter (segmented) */}
      <div
        role="group"
        className="inline-flex self-start gap-0.5 rounded-[9px] border border-border bg-sunken p-[3px]"
      >
        {STATUS_OPTIONS.map((status) => {
          const on = currentStatus === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={on}
              onClick={() =>
                updateParams({ status: status === "active" ? "" : status })
              }
              className={cn(
                "h-8 rounded-md px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
                on
                  ? "bg-surface text-text-primary shadow-card ring-1 ring-border"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {t(status)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
