"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MaintenanceRequestSuccessPage() {
  const t = useTranslations("maintenanceRequest");

  return (
    <div className="min-h-screen bg-background noise-overlay flex items-center justify-center p-4">
      <main className="w-full max-w-md text-center space-y-7 animate-fade-in-up">
        <div className="relative mx-auto h-20 w-20">
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-success/20 blur-xl"
          />
          <div className="relative h-20 w-20 rounded-2xl bg-success/10 border border-success/25 flex items-center justify-center">
            <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-success" />
          </div>
        </div>

        <div className="space-y-2.5">
          <h1 className="text-2xl font-bold text-text-primary font-display">
            {t("successTitle")}
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
            {t("successMessage")}
          </p>
        </div>

        <div className="pt-1">
          <Button
            variant="secondary"
            onClick={() => window.close()}
            className="rounded-xl px-6"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
            {t("close")}
          </Button>
        </div>

        <footer>
          <p className="text-xs text-text-secondary/50">
            MPIRE Property Management
          </p>
        </footer>
      </main>
    </div>
  );
}
