import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { Bell, FileText, Plus, Send } from "lucide-react";

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("reminders");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  const { data: reminders } = await supabase
    .from("reminder_log")
    .select(`
      *,
      tenants:tenant_id(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

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
          <h1 className="text-2xl font-semibold text-text-primary">
            Reminders & Notifications
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage reminders, notification logs, and message templates
          </p>
        </div>
      </div>

      {/* Reminder Log Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
            <Bell className="h-5 w-5 text-text-secondary" />
            Reminder Log
          </h2>
        </div>

        {reminders && reminders.length > 0 ? (
          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[650px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    Date
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    Tenant
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    Type
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    Channel
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-3">
                    Message
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
                          {(reminder.message as string)?.slice(0, 60) || "—"}
                          {(reminder.message as string)?.length > 60 ? "..." : ""}
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
            <h3 className="text-base font-medium text-text-primary mb-1">
              No reminders sent yet
            </h3>
            <p className="text-sm text-text-secondary">
              Reminders will appear here once they are sent to tenants
            </p>
          </div>
        )}
      </div>

      {/* Templates Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
            <FileText className="h-5 w-5 text-text-secondary" />
            Notification Templates
          </h2>
          <Link
            href={`/${locale}/reminders/templates/new`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Template
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
                  <h3 className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                    {template.name as string}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
                    {(template.channel as string) || "email"}
                  </span>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2">
                  {(template.body as string)?.slice(0, 120) || "No content"}
                  {(template.body as string)?.length > 120 ? "..." : ""}
                </p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-text-secondary capitalize">
                    Type: {(template.template_type as string)?.replace("_", " ") || "general"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-12 text-center">
            <FileText className="h-10 w-10 text-text-secondary/40 mx-auto mb-3" />
            <h3 className="text-base font-medium text-text-primary mb-1">
              No templates yet
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              Create notification templates for rent reminders, lease renewals, and more
            </p>
            <Link
              href={`/${locale}/reminders/templates/new`}
              className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Template
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
