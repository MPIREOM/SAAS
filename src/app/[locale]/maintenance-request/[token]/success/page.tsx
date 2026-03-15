"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, ArrowLeft } from "lucide-react";

export default function MaintenanceRequestSuccessPage() {
  const t = useTranslations("maintenanceRequest");

  return (
    <div className="min-h-screen bg-background noise-overlay flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in-up">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-text-primary font-display">
            {t("successTitle")}
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
            {t("successMessage")}
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={() => window.close()}
            className="inline-flex items-center gap-2 h-10 px-5 bg-surface border border-border text-text-primary text-sm font-medium rounded-xl hover:bg-surface-elevated transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
