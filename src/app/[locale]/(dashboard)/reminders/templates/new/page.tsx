"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function NewTemplatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = useTranslations("reminders");
  const tc = useTranslations("common");
  const ts = useTranslations("settings");
  const tt = useTranslations("tenants");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { error: insertError } = await supabase
      .from("notification_templates")
      .insert({
        name: formData.get("name") as string,
        reminder_type: formData.get("reminder_type") as string,
        channel: formData.get("channel") as string,
        language: formData.get("language") as string,
        subject: (formData.get("subject") as string) || null,
        body_template: formData.get("body_template") as string,
        whatsapp_template_name: (formData.get("whatsapp_template_name") as string) || null,
        is_active: true,
      });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    const { locale } = await params;
    router.push(`/${locale}/reminders`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t("newTemplate")} description={t("noTemplatesDescription")} />

      <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up">
        <div className="rounded-xl border border-border/60 bg-surface p-6 space-y-5">
          <Input
            name="name"
            required
            label={`${t("templateName")} *`}
            placeholder="e.g. Rent Reminder - WhatsApp"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select name="reminder_type" required label={`${t("type")} *`}>
              <option value="rent_upcoming">{t("types.rent_upcoming")}</option>
              <option value="rent_overdue">{t("types.rent_overdue")}</option>
              <option value="cheque_due">{t("types.cheque_due")}</option>
              <option value="lease_expiry">{t("types.lease_expiry")}</option>
            </Select>
            <Select name="channel" required label={`${t("channel")} *`}>
              <option value="whatsapp">{t("channels.whatsapp")}</option>
              <option value="email">{t("channels.email")}</option>
            </Select>
            <Select
              name="language"
              required
              defaultValue="en"
              label={`${ts("language")} *`}
            >
              <option value="en">{tt("languages.en")}</option>
              <option value="ar">{tt("languages.ar")}</option>
            </Select>
          </div>

          <Input
            name="subject"
            label={`${t("subject") || "Subject"} (email only)`}
            placeholder="e.g. Rent Reminder for {{month}}"
          />

          <Input
            name="whatsapp_template_name"
            label={`${t("whatsappTemplateName")} (WhatsApp only)`}
            helperText={t("whatsappTemplateNameHint")}
            placeholder="e.g. mpire_rent_upcoming_en"
            className="font-mono"
          />

          <Textarea
            name="body_template"
            required
            rows={6}
            label={`${t("messageBody")} *`}
            placeholder={`Dear {{tenant_name}},\n\nThis is a reminder that your rent of {{amount}} ${CURRENCY.code} is due on {{due_date}}.\n\nThank you.`}
            helperText={
              "Available variables: {{tenant_name}}, {{amount}}, {{due_date}}, {{property_name}}, {{unit_number}}, {{total_overdue}}, {{overdue_details}}"
            }
            className="resize-none"
          />
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={loading}>
            {tc("save")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
