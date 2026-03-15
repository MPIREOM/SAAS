"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { Lock } from "lucide-react";

export default function UpdatePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const t = useTranslations("auth");

  // Supabase automatically picks up the recovery token from the URL hash
  // when the user clicks the reset link
  useEffect(() => {
    const supabase = createClient();
    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          // User arrived via reset link — form is ready
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);

    // Redirect to login after a short delay
    const { locale } = await params;
    setTimeout(() => {
      router.push(`/${locale}/auth/login`);
    }, 2000);
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
            {t("updatePassword")}
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            {t("updatePasswordSubtitle")}
          </p>
        </div>

        {success ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-accent/10 border border-accent/20">
            <Lock className="h-5 w-5 text-accent shrink-0" />
            <p className="text-sm text-text-primary">
              {t("passwordUpdated")}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">
                {t("newPassword")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full h-11 bg-surface-elevated/50 border border-border/60 rounded-lg px-4 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-surface-elevated transition-all duration-200"
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">
                {t("confirmPassword")}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
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
                t("updatePassword")
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
