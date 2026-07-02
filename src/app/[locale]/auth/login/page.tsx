"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Building2, Eye, EyeOff } from "lucide-react";
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
    <div className="min-h-screen bg-background noise-overlay flex">
      {/* Branding panel (start side — mirrors automatically in RTL) */}
      <div className="relative hidden overflow-hidden border-e border-border/40 lg:flex lg:w-1/2">
        {/* Layered surface gradient (theme tokens, not hex) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-surface via-surface-elevated to-background"
        />

        {/* Gold glows */}
        <div
          aria-hidden="true"
          className="absolute top-0 end-0 h-96 w-96 rounded-full bg-accent/8 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 start-0 h-72 w-72 rounded-full bg-accent/5 blur-[100px]"
        />

        {/* Architectural grid */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(color-mix(in srgb, var(--accent) 30%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent) 30%, transparent) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex w-full flex-col justify-between p-12">
          <div>
            <span className="text-3xl font-display font-bold gold-shimmer tracking-tight">
              MPIRE
            </span>
          </div>

          <div className="space-y-6 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/10 px-3 py-1.5">
              <Building2 className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="text-xs font-medium tracking-wide text-accent">
                Property Management
              </span>
            </div>
            <h2 className="text-4xl font-display font-bold leading-tight text-text-primary xl:text-5xl">
              Manage your
              <br />
              properties with
              <br />
              <span className="gold-shimmer">precision</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-text-secondary">
              Professional property management platform built for Oman. Track
              tenants, invoices, maintenance, and more — all in one place.
            </p>
          </div>

          <div className="flex items-center gap-10 border-t border-border/40 pt-8">
            {[
              { value: "500+", label: "Units Managed" },
              { value: "98%", label: "Collection Rate" },
              { value: "24/7", label: "Support" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-display font-bold text-accent ltr-nums">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-text-secondary">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm animate-fade-in-up [animation-delay:100ms]">
          {/* Mobile logo */}
          <div className="mb-10 text-center lg:hidden">
            <h1 className="text-3xl font-display font-bold gold-shimmer tracking-tight">
              MPIRE
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              Property Management System
            </p>
          </div>

          {/* Form header */}
          <div className="mb-8">
            <h2 className="text-2xl font-display font-bold tracking-tight text-text-primary">
              {t("welcomeBack")}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
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
              className="h-11"
              placeholder="admin@mpire.om"
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="login-password"
                  className="text-sm font-medium tracking-tight text-foreground"
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
                  className="h-11 pe-11"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={t("password")}
                  aria-pressed={showPassword}
                  className="absolute end-1 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
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
              className="group h-11 w-full"
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
          <p className="mt-8 text-center text-xs text-text-secondary/70">
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
      className="rounded-sm text-xs font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {t("forgotPassword")}
    </Link>
  );
}
