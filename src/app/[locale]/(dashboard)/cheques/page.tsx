import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { FileCheck, AlertCircle } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

export default async function ChequesPage() {
  const t = await getTranslations("cheques");
  const supabase = await createClient();

  const { data: cheques } = await supabase
    .from("cheques")
    .select(`
      *,
      tenants(full_name)
    `)
    .order("cheque_date", { ascending: true });

  const today = new Date();

  const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    cleared: "bg-success/10 text-success",
    bounced: "bg-destructive/10 text-destructive",
    cancelled: "bg-text-secondary/10 text-text-secondary",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t("subtitle")}
        </p>
      </div>

      {cheques && cheques.length > 0 ? (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("chequeNumber")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("tenant")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("bankName")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("chequeDate")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("amount")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                  {t("status")}
                </th>
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cheques.map((cheque: Record<string, unknown>) => {
                const tenant = cheque.tenants as Record<string, unknown> | null;
                const chequeDate = parseISO(cheque.cheque_date as string);
                const daysUntil = differenceInDays(chequeDate, today);
                const isDueSoon =
                  cheque.status === "pending" && daysUntil >= 0 && daysUntil <= 7;
                const isOverdue =
                  cheque.status === "pending" && daysUntil < 0;

                return (
                  <tr
                    key={cheque.id as string}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary font-mono">
                      {cheque.cheque_number as string}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {tenant?.full_name as string || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {cheque.bank_name as string}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary font-mono ltr-nums">
                      <span className="flex items-center gap-1.5">
                        {cheque.cheque_date as string}
                        {isDueSoon && (
                          <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                            {t("dueSoon")}
                          </span>
                        )}
                        {isOverdue && (
                          <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                            {t("overdue")}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary font-mono ltr-nums">
                      {cheque.amount as number} OMR
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          statusColors[(cheque.status as string) || "pending"]
                        }`}
                      >
                        {t(`statuses.${cheque.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(isDueSoon || isOverdue) && (
                        <AlertCircle className="h-4 w-4 text-warning" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <FileCheck className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
          <h3 className="text-base font-medium text-text-primary mb-1">
            {t("noCheques")}
          </h3>
          <p className="text-sm text-text-secondary">
            {t("noChequesDescription")}
          </p>
        </div>
      )}
    </div>
  );
}
