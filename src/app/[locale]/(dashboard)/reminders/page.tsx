import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { getTranslations } from "next-intl/server";
import { Bell, FileText, Plus, Pencil } from "lucide-react";
import { ReminderTriggerButton } from "@/components/reminders/trigger-button";
import { ReminderRules } from "@/components/reminders/reminder-rules";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("reminders");
  const tc = await getTranslations("common");
  const supabase = await createClient();

  // Property-level access control — a single joined query replaces the old
  // units -> leases two-step lookup (one round-trip instead of two)
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  let accessibleTenantIds: string[] | null = null;
  if (propertyIds !== null) {
    const { data: leases } = await supabase
      .from("leases")
      .select("tenant_id, units!inner(property_id)")
      .in("units.property_id", propertyIds.length > 0 ? propertyIds : ["__no_access__"]);
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

  // Log and templates load in parallel
  const [{ data: reminders }, { data: templates }] = await Promise.all([
    remindersQuery,
    supabase.from("notification_templates").select("*").order("name"),
  ]);

  const statusVariant = (s: string): "success" | "destructive" | "warning" => {
    if (s === "sent") return "success";
    if (s === "failed") return "destructive";
    return "warning";
  };

  const channelVariant = (c: string): "success" | "default" | "warning" => {
    if (c === "whatsapp") return "success";
    if (c === "sms") return "warning";
    return "default";
  };

  const messageExcerpt = (content: unknown) => {
    const text = (content as string) || "";
    if (!text) return "—";
    return text.length > 60 ? `${text.slice(0, 60)}...` : text;
  };

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} description={t("subtitle")}>
        <ReminderTriggerButton />
      </PageHeader>

      {/* Reminder Log Section */}
      <section className="space-y-4 animate-fade-in-up">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 border border-accent/15">
            <Bell aria-hidden="true" className="h-4 w-4 text-accent" />
          </span>
          <h2 className="text-lg font-semibold text-text-primary font-display">
            {t("log")}
          </h2>
          {reminders && reminders.length > 0 && (
            <span className="rounded-md border border-border/40 bg-surface-elevated px-2 py-0.5 font-mono text-xs font-medium text-text-secondary ltr-nums">
              {reminders.length}
            </span>
          )}
        </div>

        {reminders && reminders.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-surface">
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">{t("date")}</TableHead>
                    <TableHead className="px-4">{t("tenant")}</TableHead>
                    <TableHead className="px-4">{t("type")}</TableHead>
                    <TableHead className="px-4">{t("channel")}</TableHead>
                    <TableHead className="px-4">{t("status")}</TableHead>
                    <TableHead className="px-4">{t("message")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((reminder: Record<string, unknown>) => {
                    const tenant = reminder.tenants as Record<string, unknown> | null;

                    return (
                      <TableRow key={reminder.id as string}>
                        <TableCell className="px-4 whitespace-nowrap font-mono text-text-secondary ltr-nums">
                          {new Date(reminder.created_at as string).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-4 font-medium text-text-primary">
                          {(tenant?.full_name as string) || "—"}
                        </TableCell>
                        <TableCell className="px-4 text-text-secondary">
                          {reminder.reminder_type ? t(`types.${reminder.reminder_type}`) : "—"}
                        </TableCell>
                        <TableCell className="px-4">
                          {reminder.channel ? (
                            <Badge variant={channelVariant(reminder.channel as string)}>
                              {t(`channels.${reminder.channel}`)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-text-secondary">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4">
                          {reminder.status ? (
                            <Badge variant={statusVariant(reminder.status as string)}>
                              {t(`statuses.${reminder.status}`)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-text-secondary">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4">
                          <span className="block max-w-[250px] truncate text-text-secondary">
                            {messageExcerpt(reminder.message_content)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-border/40">
              {reminders.map((reminder: Record<string, unknown>) => {
                const tenant = reminder.tenants as Record<string, unknown> | null;

                return (
                  <li key={`m-${reminder.id as string}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {(tenant?.full_name as string) || "—"}
                        </p>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {reminder.reminder_type ? t(`types.${reminder.reminder_type}`) : "—"}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-text-secondary ltr-nums">
                        {new Date(reminder.created_at as string).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {Boolean(reminder.channel) && (
                        <Badge variant={channelVariant(reminder.channel as string)}>
                          {t(`channels.${reminder.channel}`)}
                        </Badge>
                      )}
                      {Boolean(reminder.status) && (
                        <Badge variant={statusVariant(reminder.status as string)}>
                          {t(`statuses.${reminder.status}`)}
                        </Badge>
                      )}
                    </div>
                    {Boolean(reminder.message_content) && (
                      <p className="mt-2 truncate text-xs text-text-secondary">
                        {messageExcerpt(reminder.message_content)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title={t("noRemindersSent")}
            description={t("noRemindersSentDescription")}
          />
        )}
      </section>

      {/* Reminder Rules Section */}
      <ReminderRules />

      {/* Templates Section */}
      <section className="space-y-4 animate-fade-in-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 border border-accent/15">
              <FileText aria-hidden="true" className="h-4 w-4 text-accent" />
            </span>
            <h2 className="text-lg font-semibold text-text-primary font-display">
              {t("notificationTemplates")}
            </h2>
            {templates && templates.length > 0 && (
              <span className="rounded-md border border-border/40 bg-surface-elevated px-2 py-0.5 font-mono text-xs font-medium text-text-secondary ltr-nums">
                {templates.length}
              </span>
            )}
          </div>
          <Link
            href={`/${locale}/reminders/templates/new`}
            className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("newTemplate")}
          </Link>
        </div>

        {templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
            {templates.map((template: Record<string, unknown>) => (
              <Link
                key={template.id as string}
                href={`/${locale}/reminders/templates/${template.id}`}
                className="group flex flex-col rounded-xl border border-border/60 bg-surface p-5 transition-all duration-200 hover:border-accent/30 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium text-text-primary font-display transition-colors group-hover:text-accent">
                    {template.name as string}
                  </h3>
                  <Badge
                    variant={channelVariant((template.channel as string) || "email")}
                    className="capitalize shrink-0"
                  >
                    {(template.channel as string) || "email"}
                  </Badge>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2">
                  {(template.body_template as string)?.slice(0, 120) || "—"}
                  {(template.body_template as string)?.length > 120 ? "..." : ""}
                </p>
                <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3">
                  <span className="text-xs text-text-secondary capitalize">
                    {t("type")}: {template.reminder_type ? t(`types.${template.reminder_type}`) : "—"}
                  </span>
                  <span className="ms-auto inline-flex items-center gap-1 text-xs font-medium text-text-secondary transition-colors group-hover:text-accent">
                    <Pencil aria-hidden="true" className="h-3 w-3" />
                    {tc("edit")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={t("noTemplates")}
            description={t("noTemplatesDescription")}
            action={
              <Link
                href={`/${locale}/reminders/templates/new`}
                className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t("newTemplate")}
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
