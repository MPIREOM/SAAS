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
              {t("updatePassword")}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
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
                  className="text-sm font-medium text-foreground"
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
                    className="h-12 pe-12"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    aria-pressed={showPassword}
                    className="absolute end-1 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
                className="h-12"
                placeholder="••••••••"
              />

              {error && <Alert variant="destructive">{error}</Alert>}

              <Button type="submit" loading={loading} size="lg" className="w-full">
                {t("updatePassword")}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
