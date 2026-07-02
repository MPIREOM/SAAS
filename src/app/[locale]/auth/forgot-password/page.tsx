"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="relative min-h-screen bg-background noise-overlay flex items-center justify-center overflow-hidden p-6">
      {/* Gold glows */}
      <div
        aria-hidden="true"
        className="absolute -top-24 end-1/4 h-80 w-80 rounded-full bg-accent/6 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 start-1/4 h-72 w-72 rounded-full bg-accent/4 blur-[100px]"
      />

      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-display font-bold gold-shimmer tracking-tight">
            MPIRE
          </h1>
        </div>

        <div className="rounded-2xl border border-border/40 bg-surface/80 p-8 shadow-2xl backdrop-blur-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-display font-bold tracking-tight text-text-primary">
              {t("resetPassword")}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              {t("forgotPasswordSubtitle")}
            </p>
          </div>

          {sent ? (
            <div className="space-y-6">
              <Alert variant="success">{t("resetPasswordSent")}</Alert>
              <LinkButton params={params} t={t} />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label={t("email")}
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
                placeholder="admin@mpire.om"
              />

              {error && <Alert variant="destructive">{error}</Alert>}

              <Button type="submit" loading={loading} className="h-11 w-full">
                {t("sendResetLink")}
              </Button>

              <LinkButton params={params} t={t} />
            </form>
          )}
        </div>
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
  const { locale } = use(params);

  return (
    <Link
      href={`/${locale}/auth/login`}
      className="flex items-center justify-center gap-2 rounded-md p-1 text-sm text-text-secondary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      {t("backToLogin")}
    </Link>
  );
}
