"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function EditTenantPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const router = useRouter();

  const [locale, setLocale] = useState("");
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    nationality: "",
    national_id: "",
    phone: "",
    email: "",
    emergency_contact: "",
    language_preference: "en",
  });

  useEffect(() => {
    params.then(({ locale, id }) => {
      setLocale(locale);
      setId(id);

      const supabase = createClient();
      supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single()
        .then(({ data }) => {
          if (data) {
            setForm({
              full_name: data.full_name ?? "",
              nationality: data.nationality ?? "",
              national_id: data.national_id ?? "",
              phone: data.phone ?? "",
              email: data.email ?? "",
              emergency_contact: data.emergency_contact ?? "",
              language_preference: data.language_preference ?? "en",
            });
          }
          setFetching(false);
        });
    });
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        full_name: form.full_name,
        nationality: form.nationality || null,
        national_id: form.national_id || null,
        phone: form.phone,
        email: form.email || null,
        emergency_contact: form.emergency_contact || null,
        language_preference: form.language_preference,
      })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push(`/${locale}/tenants/${id}`);
    router.refresh();
  };

  const field = (
    label: string,
    key: keyof typeof form,
    opts?: { required?: boolean; type?: string; placeholder?: string; mono?: boolean }
  ) => (
    <div>
      <label className="block text-sm text-text-secondary mb-1.5">
        {label}
        {opts?.required && <span className="text-destructive"> *</span>}
      </label>
      <input
        type={opts?.type ?? "text"}
        required={opts?.required}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={opts?.placeholder}
        className={`w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors ${opts?.mono ? "font-mono" : ""}`}
      />
    </div>
  );

  if (fetching) {
    return (
      <div className="max-w-2xl space-y-4 animate-pulse">
        <div className="h-8 bg-surface-elevated rounded w-1/3" />
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-surface-elevated rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href={`/${locale}/tenants/${id}`}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-text-primary">
            {t("editTenant")}
          </h1>
        </div>
        <p className="text-sm text-text-secondary">{form.full_name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          {field(t("fullName"), "full_name", { required: true, placeholder: t("fullNamePlaceholder") })}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field(t("nationality"), "nationality", { placeholder: t("nationalityPlaceholder") })}
            {field(t("nationalId"), "national_id", { placeholder: t("nationalIdPlaceholder"), mono: true })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field(t("phone"), "phone", { required: true, placeholder: t("phonePlaceholder"), mono: true })}
            {field(t("email"), "email", { type: "email", placeholder: t("emailPlaceholder") })}
          </div>

          {field(t("emergencyContact"), "emergency_contact", { placeholder: t("emergencyContactPlaceholder") })}

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t("languagePreference")}
            </label>
            <select
              value={form.language_preference}
              onChange={(e) => setForm((f) => ({ ...f, language_preference: e.target.value }))}
              className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="en">{t("languages.en")}</option>
              <option value="ar">{t("languages.ar")}</option>
            </select>
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
          <Link
            href={`/${locale}/tenants/${id}`}
            className="h-9 px-4 inline-flex items-center bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            {tc("cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
