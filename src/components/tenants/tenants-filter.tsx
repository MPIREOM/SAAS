"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useCallback, useTransition } from "react";

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
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      {/* Search bar */}
      <div className="relative flex-1 w-full sm:max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
        <input
          type="text"
          defaultValue={currentSearch}
          placeholder={t("searchPlaceholder")}
          onChange={(e) => updateParams({ search: e.target.value })}
          className="w-full h-9 ps-9 pe-3 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
        />
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            onClick={() =>
              updateParams({ status: status === "active" ? "" : status })
            }
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              currentStatus === status
                ? "bg-accent text-background"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(status)}
          </button>
        ))}
      </div>
    </div>
  );
}
