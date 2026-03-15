"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const t = useTranslations("auth");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { locale } = await params;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/${locale}/auth/update-password`,
      }
    );

    if (resetError) {
      setError(t("resetError"));
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background noise-overlay flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-display font-bold gold-shimmer tracking-tight">
            MPIRE
          </h1>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-display font-bold text-text-primary tracking-tight">
            {t("resetPassword")}
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            {t("forgotPasswordSubtitle")}
          </p>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-accent/10 border border-accent/20">
              <Mail className="h-5 w-5 text-accent shrink-0" />
              <p className="text-sm text-text-primary">
                {t("resetPasswordSent")}
              </p>
            </div>
            <LinkButton params={params} t={t} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">
                {t("email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-lg px-4 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-surface-elevated transition-all duration-200"
                placeholder="admin@mpire.om"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "group w-full h-11 bg-accent hover:bg-accent-hover text-accent-foreground font-semibold rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2",
                "shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30",
                "active:scale-[0.98]",
                loading && "opacity-50 cursor-not-allowed"
              )}
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
              ) : (
                t("sendResetLink")
              )}
            </button>

            <LinkButton params={params} t={t} />
          </form>
        )}
      </div>
    </div>
  );
}

function LinkButton({
  params,
  t,
}: {
  params: Promise<{ locale: string }>;
  t: ReturnType<typeof useTranslations>;
}) {
  const [locale, setLocale] = useState("en");
  params.then((p) => setLocale(p.locale));

  return (
    <Link
      href={`/${locale}/auth/login`}
      className="flex items-center justify-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("backToLogin")}
    </Link>
  );
}
