import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import type { ProviderStatus } from "@/lib/e-mandates/provider";

// Server component: read-only view of which mandate provider is live and
// which Bank Muscat variables are still missing. Never shows secret values.
export async function EMandateProviderPanel({ status }: { status: ProviderStatus }) {
  const t = await getTranslations("settings");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-text-secondary">{t("eMandatesActiveProvider")}</span>
        <Badge variant={status.active === "bank_muscat" ? "success" : "warning"}>
          {status.active === "bank_muscat" ? "Bank Muscat" : t("eMandatesMockProvider")}
        </Badge>
        {status.forced && <span className="text-xs text-text-secondary font-mono">E_MANDATE_PROVIDER</span>}
      </div>

      {status.active === "mock" && (
        <Alert variant="warning">
          {t("eMandatesMockWarning", { otp: status.mock.otpHint, result: status.mock.collectResult })}
        </Alert>
      )}

      <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-4">
        <p className="text-sm font-medium text-text-primary mb-2">{t("eMandatesBankMuscatVars")}</p>
        {status.bankMuscat.configured ? (
          <p className="text-sm text-success">{t("eMandatesBankMuscatReady")}</p>
        ) : (
          <>
            <p className="text-xs text-text-secondary mb-2">{t("eMandatesBankMuscatMissing")}</p>
            <ul className="flex flex-wrap gap-2">
              {status.bankMuscat.missing.map((k) => (
                <li key={k} className="font-mono ltr-nums text-xs px-2 py-1 rounded-md border border-border/60 bg-surface text-text-secondary">
                  {k}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-border/60 p-3">
          <dt className="text-text-secondary">{t("eMandatesWebhookUrl")}</dt>
          <dd className="font-mono ltr-nums text-text-primary mt-1 break-all">/api/webhooks/bank-muscat</dd>
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <dt className="text-text-secondary">{t("eMandatesCronSchedule")}</dt>
          <dd className="font-mono ltr-nums text-text-primary mt-1">/api/cron/e-mandate-collections · 10:00 Muscat</dd>
        </div>
      </dl>
      <p className="text-xs text-text-secondary">{t("eMandatesDocsHint")}</p>
    </div>
  );
}
