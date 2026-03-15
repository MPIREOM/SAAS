"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Trash2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

interface Template {
  id: string;
  name: string;
  reminder_type: string;
  channel: string;
  language: string;
  subject: string | null;
  body_template: string;
  is_active: boolean;
}

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const t = useTranslations("reminders");
  const tc = useTranslations("common");
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
        <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text-primary font-display">
          {t("editTemplate") || "Edit Template"}
        </h1>
        <button
          onClick={() => setShowDeleteDialog(true)}
          disabled={deleting}
          className="inline-flex items-center gap-2 h-9 px-4 bg-destructive/10 text-destructive text-sm font-medium rounded-md hover:bg-destructive/20 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {tc("delete") || "Delete"}
        </button>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent maxWidth="max-w-sm">
            <DialogHeader>
              <DialogTitle>{tc("confirmDelete") || "Delete Template"}</DialogTitle>
              <DialogDescription>
                {t("deleteTemplateConfirm") || "Are you sure you want to delete this template? This action cannot be undone."}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <p className="text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">{template.name}</span>
                </p>
              </div>
            </DialogBody>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
              >
                {tc("cancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="h-9 px-4 bg-destructive hover:bg-destructive/90 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {deleting ? tc("loading") : tc("delete") || "Delete"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              defaultValue={template.name}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
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
                defaultValue={template.reminder_type}
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
                defaultValue={template.channel}
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
                defaultValue={template.language}
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
              defaultValue={template.subject || ""}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
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
              defaultValue={template.body_template}
              className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
            />
            <p className="text-xs text-text-secondary mt-1.5">
              Available variables: {"{{tenant_name}}"}, {"{{amount}}"}, {"{{due_date}}"}, {"{{property}}"}, {"{{unit}}"}
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
