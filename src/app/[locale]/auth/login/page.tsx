"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("auth");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(t("loginError"));
      setLoading(false);
      return;
    }

    const { locale } = await params;
    router.push(`/${locale}/dashboard`);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Branding panel (start side — mirrors automatically in RTL) */}
      <div className="hidden bg-brand-panel text-brand-panel-foreground lg:flex lg:w-1/2">
        <div className="flex w-full flex-col justify-between p-12">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-lg bg-brand-panel-foreground text-[15px] font-bold text-brand-panel"
            >
              M
            </span>
            <span className="text-lg font-bold tracking-[0.14em]">MPIRE</span>
          </div>

          <div className="max-w-lg space-y-5">
            <h2 className="text-4xl font-display font-bold leading-tight text-balance xl:text-[44px]">
              {t("brandHeadline")}
            </h2>
            <p className="max-w-md text-base leading-relaxed opacity-90">
              {t("brandDescription")}
            </p>
          </div>

          <p className="text-[13px] opacity-90">
            MPIRE Property Management &middot; Oman
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-10 flex flex-col items-center gap-3 text-center lg:hidden">
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-foreground"
            >
              M
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-[0.14em] text-text-primary">
                MPIRE
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                {t("brandTagline")}
              </p>
            </div>
          </div>

          {/* Form header */}
          <div className="mb-8">
            <h2 className="text-2xl font-display font-bold text-text-primary">
              {t("welcomeBack")}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {t("loginSubtitle")}
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-5">
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

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="login-password"
                  className="text-[13px] font-semibold text-foreground"
                >
                  {t("password")}
                </label>
                <ForgotLink params={params} t={t} />
              </div>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 pe-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  aria-pressed={showPassword}
                  className="absolute end-1 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:text-text-primary hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {error && <Alert variant="destructive">{error}</Alert>}

            <Button
              type="submit"
              loading={loading}
              size="lg"
              className="group w-full"
            >
              {t("loginButton")}
              {!loading && (
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  aria-hidden="true"
                />
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-text-tertiary lg:hidden">
            MPIRE Property Management &middot; Oman
          </p>
        </div>
      </div>
    </div>
  );
}

function ForgotLink({
  params,
  t,
}: {
  params: Promise<{ locale: string }>;
  t: ReturnType<typeof useTranslations>;
}) {
  const { locale } = use(params);

  return (
    <Link
      href={`/${locale}/auth/forgot-password`}
      className="rounded-sm text-[13px] font-semibold text-accent transition-colors hover:text-accent-hover hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {t("forgotPassword")}
    </Link>
  );
}
