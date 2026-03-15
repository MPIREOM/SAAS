import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Bell, FileText, Plus } from "lucide-react";
import { ReminderTriggerButton } from "@/components/reminders/trigger-button";

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("reminders");
  const supabase = await createClient();

  // Property-level access control
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  let accessibleTenantIds: string[] | null = null;
  if (propertyIds !== null) {
    const { data: units } = await supabase.from("units").select("id").in("property_id", propertyIds);
    const unitIds = units?.map(u => u.id) || [];
    const { data: leases } = await supabase.from("leases").select("tenant_id").in("unit_id", unitIds.length > 0 ? unitIds : ["__no_access__"]);
    accessibleTenantIds = [...new Set(leases?.map(l => l.tenant_id) || [])];
  }

  let remindersQuery = supabase
    .from("reminder_logs")
    .select(`
      *,
      tenants:tenant_id(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(50);
  if (accessibleTenantIds !== null) {
    remindersQuery = remindersQuery.in("tenant_id", accessibleTenantIds.length > 0 ? accessibleTenantIds : ["__no_access__"]);
  }
  const { data: reminders } = await remindersQuery;

  const { data: templates } = await supabase
    .from("notification_templates")
    .select("*")
    .order("name");

  const statusColors: Record<string, string> = {
    sent: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
    pending: "bg-warning/10 text-warning",
  };

  const channelIcons: Record<string, string> = {
    whatsapp: "bg-success/10 text-success",
    email: "bg-accent/10 text-accent",
    sms: "bg-warning/10 text-warning",
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-display">
            {t("title")}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t("subtitle")}
          </p>
        </div>
        <ReminderTriggerButton />
      </div>

      {/* Reminder Log Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary font-display flex items-center gap-2">
            <Bell className="h-5 w-5 text-text-secondary" />
            {t("log")}
          </h2>
        </div>

        {reminders && reminders.length > 0 ? (
          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[650px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("date")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("tenant")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("type")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("channel")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("status")}
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    {t("message")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reminders.map((reminder: Record<string, unknown>) => {
                  const tenant = reminder.tenants as Record<string, unknown> | null;

                  return (
                    <tr
                      key={reminder.id as string}
                      className="hover:bg-surface-elevated/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary font-mono ltr-nums">
                          {new Date(reminder.created_at as string).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-primary">
                          {(tenant?.full_name as string) || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary capitalize">
                          {(reminder.reminder_type as string)?.replace("_", " ") || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                            channelIcons[(reminder.channel as string) || "email"]
                          }`}
                        >
                          {reminder.channel as string}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                            statusColors[(reminder.status as string) || "pending"]
                          }`}
                        >
                          {reminder.status as string}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary max-w-[250px] truncate block">
                          {(reminder.message_content as string)?.slice(0, 60) || "—"}
                          {(reminder.message_content as string)?.length > 60 ? "..." : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-12 text-center">
            <Bell className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
            <h3 className="text-base font-medium text-text-primary mb-1 font-display">
              {t("noRemindersSent")}
            </h3>
            <p className="text-sm text-text-secondary">
              {t("noRemindersSentDescription")}
            </p>
          </div>
        )}
      </div>

      {/* Templates Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary font-display flex items-center gap-2">
            <FileText className="h-5 w-5 text-text-secondary" />
            {t("notificationTemplates")}
          </h2>
          <Link
            href={`/${locale}/reminders/templates/new`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("newTemplate")}
          </Link>
        </div>

        {templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((template: Record<string, unknown>) => (
              <Link
                key={template.id as string}
                href={`/${locale}/reminders/templates/${template.id}`}
                className="bg-surface border border-border rounded-lg p-5 hover:border-accent/30 transition-colors group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors font-display">
                    {template.name as string}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
                    {(template.channel as string) || "email"}
                  </span>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2">
                  {(template.body_template as string)?.slice(0, 120) || "—"}
                  {(template.body_template as string)?.length > 120 ? "..." : ""}
                </p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-text-secondary capitalize">
                    {t("type")}: {(template.reminder_type as string)?.replace("_", " ") || "—"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-12 text-center">
            <FileText className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
            <h3 className="text-base font-medium text-text-primary mb-1 font-display">
              {t("noTemplates")}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {t("noTemplatesDescription")}
            </p>
            <Link
              href={`/${locale}/reminders/templates/new`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("newTemplate")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
