"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-accent tracking-tight">
            MPIRE
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Property Management System
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            {t("welcomeBack")}
          </h2>
          <p className="text-sm text-text-secondary mb-6">
            {t("loginSubtitle")}
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent transition-colors"
                placeholder="admin@mpire.om"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t("password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full h-10 bg-accent hover:bg-accent-hover text-background font-medium rounded-md text-sm transition-colors",
                loading && "opacity-50 cursor-not-allowed"
              )}
            >
              {loading ? t("loading") : t("loginButton")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
