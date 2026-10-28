"use client";

import { useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    // Error logged by error boundary
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-3">
        <div className="mb-1 w-11 h-11 rounded-xl bg-destructive-tint flex items-center justify-center" aria-hidden="true">
          <AlertTriangle className="h-[22px] w-[22px] text-destructive-text" />
        </div>

        <h2 className="text-[17px] font-bold text-text-primary font-display">
          {t("somethingWentWrong")}
        </h2>
        <p className="text-sm text-text-secondary">
          {t("errorDescription")}
        </p>
        {error.digest && (
          <p className="text-xs text-text-tertiary font-mono">
            Error ID: {error.digest}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("tryAgain")}
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/${locale}/dashboard`)}>
            <Home className="h-4 w-4" aria-hidden="true" />
            {t("dashboard")}
          </Button>
        </div>
      </div>
    </div>
  );
}
