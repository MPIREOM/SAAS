"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";

export default function NewTemplatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = useTranslations("reminders");
  const tc = useTranslations("common");
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
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary font-display">
          {t("newTemplate") || "New Template"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("templateName") || "Template Name"}{" "}
              <span className="text-destructive">*</span>
            </label>
            <input
              name="name"
              required
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder="e.g. Rent Reminder - WhatsApp"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("type")} <span className="text-destructive">*</span>
              </label>
              <select
                name="reminder_type"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="rent_upcoming">Rent Upcoming</option>
                <option value="rent_overdue">Rent Overdue</option>
                <option value="cheque_due">Cheque Due</option>
                <option value="lease_expiry">Lease Expiry</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("channel")} <span className="text-destructive">*</span>
              </label>
              <select
                name="channel"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                Language <span className="text-destructive">*</span>
              </label>
              <select
                name="language"
                required
                defaultValue="en"
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="en">English</option>
                <option value="ar">Arabic</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("subject") || "Subject"} (email only)
            </label>
            <input
              name="subject"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder="e.g. Rent Reminder for {{month}}"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("whatsappTemplateName")} (WhatsApp only)
            </label>
            <input
              name="whatsapp_template_name"
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors font-mono"
              placeholder="e.g. mpire_rent_upcoming_en"
            />
            <p className="text-xs text-text-secondary mt-1.5">
              {t("whatsappTemplateNameHint")}
            </p>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("body") || "Message Body"}{" "}
              <span className="text-destructive">*</span>
            </label>
            <textarea
              name="body_template"
              required
              rows={6}
              className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder={`Dear {{tenant_name}},\n\nThis is a reminder that your rent of {{amount}} ${CURRENCY.code} is due on {{due_date}}.\n\nThank you.`}
            />
            <p className="text-xs text-text-secondary mt-1.5">
              Available variables: {"{{tenant_name}}"}, {"{{amount}}"}, {"{{due_date}}"}, {"{{property}}"}, {"{{unit}}"}, {"{{total_overdue}}"}, {"{{overdue_details}}"}
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? tc("loading") : tc("save")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
