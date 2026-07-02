"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UpdatePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
              {t("updatePassword")}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              {t("updatePasswordSubtitle")}
            </p>
          </div>

          {success ? (
            <Alert variant="success">{t("passwordUpdated")}</Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="new-password"
                  className="text-sm font-medium tracking-tight text-foreground"
                >
                  {t("newPassword")}
                </label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-11 pe-11"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
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

              <Input
                label={t("confirmPassword")}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="h-11"
                placeholder="••••••••"
              />

              {error && <Alert variant="destructive">{error}</Alert>}

              <Button type="submit" loading={loading} className="h-11 w-full">
                {t("updatePassword")}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
