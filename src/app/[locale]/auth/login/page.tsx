"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { Building2, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      {/* Left panel — Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#13121A] via-[#1B1A23] to-[#0B0A0F]" />

        {/* Gold glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-accent/5 rounded-full blur-[100px]" />

        {/* Decorative grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(201,168,76,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.3) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <span className="text-3xl font-display font-bold gold-shimmer tracking-tight">
              MPIRE
            </span>
          </div>

          <div className="space-y-6 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20">
              <Building2 className="h-4 w-4 text-accent" />
              <span className="text-xs font-medium text-accent">Property Management</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-display font-bold text-text-primary leading-tight">
              Manage your<br />
              properties with<br />
              <span className="gold-shimmer">precision</span>
            </h2>
            <p className="text-text-secondary max-w-md text-base leading-relaxed">
              Professional property management platform built for Oman.
              Track tenants, invoices, maintenance, and more — all in one place.
            </p>
          </div>

          <div className="flex items-center gap-8">
            {[
              { value: "500+", label: "Units Managed" },
              { value: "98%", label: "Collection Rate" },
              { value: "24/7", label: "Support" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-display font-bold text-accent">{stat.value}</p>
                <p className="text-xs text-text-secondary mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — Login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          {/* Mobile logo */}
          <div className="text-center mb-10 lg:hidden">
            <h1 className="text-3xl font-display font-bold gold-shimmer tracking-tight">
              MPIRE
            </h1>
            <p className="text-text-secondary text-sm mt-2">
              Property Management System
            </p>
          </div>

          {/* Form header */}
          <div className="mb-8">
            <h2 className="text-2xl font-display font-bold text-text-primary tracking-tight">
              {t("welcomeBack")}
            </h2>
            <p className="text-sm text-text-secondary mt-2">
              {t("loginSubtitle")}
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-5">
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-text-secondary">
                  {t("password")}
                </label>
                <ForgotLink params={params} t={t} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-lg px-4 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-surface-elevated transition-all duration-200"
                placeholder="••••••••"
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
                <>
                  {t("loginButton")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-text-secondary/60 mt-8">
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
  const [locale, setLocale] = useState("en");
  params.then((p) => setLocale(p.locale));

  return (
    <Link
      href={`/${locale}/auth/forgot-password`}
      className="text-xs text-accent hover:text-accent-hover transition-colors"
    >
      {t("forgotPassword")}
    </Link>
  );
}
