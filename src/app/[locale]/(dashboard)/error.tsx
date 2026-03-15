"use client";

import { useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-primary font-display">
            {t("somethingWentWrong")}
          </h2>
          <p className="text-sm text-text-secondary">
            {t("errorDescription")}
          </p>
          {error.digest && (
            <p className="text-xs text-text-secondary/60 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            {t("tryAgain")}
          </button>
          <button
            onClick={() => router.push(`/${locale}/dashboard`)}
            className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            <Home className="h-4 w-4" />
            {t("dashboard")}
          </button>
        </div>
      </div>
    </div>
  );
}
