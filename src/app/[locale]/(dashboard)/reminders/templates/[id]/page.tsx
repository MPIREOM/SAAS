"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

interface Template {
  id: string;
  name: string;
  reminder_type: string;
  channel: string;
  language: string;
  subject: string | null;
  body_template: string;
  whatsapp_template_name: string | null;
  is_active: boolean;
}

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const t = useTranslations("reminders");
  const tc = useTranslations("common");
  const ts = useTranslations("settings");
  const tt = useTranslations("tenants");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);

  useEffect(() => {
    const load = async () => {
      const { id } = await params;
      const supabase = createClient();
      const { data } = await supabase
        .from("notification_templates")
        .select("*")
        .eq("id", id)
        .single();
      if (data) setTemplate(data as Template);
    };
    load();
  }, [params]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!template) return;
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("notification_templates")
      .update({
        name: formData.get("name") as string,
        reminder_type: formData.get("reminder_type") as string,
        channel: formData.get("channel") as string,
        language: formData.get("language") as string,
        subject: (formData.get("subject") as string) || null,
        body_template: formData.get("body_template") as string,
        whatsapp_template_name: (formData.get("whatsapp_template_name") as string) || null,
      })
      .eq("id", template.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    const { locale } = await params;
    router.push(`/${locale}/reminders`);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!template) return;
    setDeleting(true);

    const supabase = createClient();
    await supabase
      .from("notification_templates")
      .delete()
      .eq("id", template.id);

    const { locale } = await params;
    router.push(`/${locale}/reminders`);
    router.refresh();
  };

  if (!template) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner label={tc("loading")} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t("editTemplate")}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowDeleteDialog(true)}
          disabled={deleting}
          className="border border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {tc("delete") || "Delete"}
        </Button>
      </PageHeader>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent maxWidth="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tc("confirmDelete") || "Delete Template"}</DialogTitle>
            <DialogDescription>
              {t("deleteTemplateConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Alert variant="destructive">
              <span className="font-medium">{template.name}</span>
            </Alert>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDeleteDialog(false)}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              loading={deleting}
            >
              {tc("delete") || "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up">
        <div className="rounded-xl border border-border/60 bg-surface p-6 space-y-5">
          <Input
            name="name"
            required
            defaultValue={template.name}
            label={`${t("templateName")} *`}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              name="reminder_type"
              required
              defaultValue={template.reminder_type}
              label={`${t("type")} *`}
            >
              <option value="rent_upcoming">{t("types.rent_upcoming")}</option>
              <option value="rent_overdue">{t("types.rent_overdue")}</option>
              <option value="cheque_due">{t("types.cheque_due")}</option>
              <option value="lease_expiry">{t("types.lease_expiry")}</option>
            </Select>
            <Select
              name="channel"
              required
              defaultValue={template.channel}
              label={`${t("channel")} *`}
            >
              <option value="whatsapp">{t("channels.whatsapp")}</option>
              <option value="email">{t("channels.email")}</option>
            </Select>
            <Select
              name="language"
              required
              defaultValue={template.language}
              label={`${ts("language")} *`}
            >
              <option value="en">{tt("languages.en")}</option>
              <option value="ar">{tt("languages.ar")}</option>
            </Select>
          </div>

          <Input
            name="subject"
            defaultValue={template.subject || ""}
            label={`${t("subject")} (${t("emailOnly")})`}
          />

          <Input
            name="whatsapp_template_name"
            defaultValue={template.whatsapp_template_name || ""}
            label={`${t("whatsappTemplateName")} (${t("whatsappOnly")})`}
            helperText={t("whatsappTemplateNameHint")}
            placeholder="e.g. mpire_rent_upcoming_en"
            className="font-mono"
          />

          <Textarea
            name="body_template"
            required
            rows={6}
            defaultValue={template.body_template}
            label={`${t("messageBody")} *`}
            helperText={`${t("availableVariables")}: {{tenant_name}}, {{amount}}, {{due_date}}, {{property_name}}, {{unit_number}}, {{total_overdue}}, {{overdue_details}}`}
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
