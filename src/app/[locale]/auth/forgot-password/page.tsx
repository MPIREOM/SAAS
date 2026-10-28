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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-[15px] font-bold text-accent-foreground"
          >
            M
          </span>
          <h1 className="text-lg font-bold tracking-[0.14em] text-text-primary">
            MPIRE
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-display font-bold text-text-primary">
              {t("resetPassword")}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
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
                className="h-12"
                placeholder="admin@mpire.om"
              />

              {error && <Alert variant="destructive">{error}</Alert>}

              <Button type="submit" loading={loading} size="lg" className="w-full">
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
      className="flex items-center justify-center gap-2 rounded-md p-1 text-sm text-text-secondary transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      {t("backToLogin")}
    </Link>
  );
}
