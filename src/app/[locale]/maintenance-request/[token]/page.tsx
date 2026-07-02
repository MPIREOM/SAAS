"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wrench, Send, AlertTriangle, Building2 } from "lucide-react";
import { MediaUpload } from "@/components/maintenance/media-upload";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface TokenInfo {
  property_id: string;
  property_name: string;
}

export default function PublicMaintenanceRequestPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const t = useTranslations("maintenanceRequest");
  const tm = useTranslations("maintenance");
  const tc = useTranslations("common");
  const router = useRouter();

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);

  useEffect(() => {
    const validate = async () => {
      const { token } = await params;
      try {
        const res = await fetch("/api/maintenance-request/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          setInvalid(true);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setTokenInfo(data);
      } catch {
        setInvalid(true);
      }
      setLoading(false);
    };
    validate();
  }, [params]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    // Capture form element before any await (React nullifies synthetic events)
    const form = e.currentTarget;
    const { locale, token } = await params;
    const formData = new FormData(form);
    formData.set("token", token);

    // Append media files
    photos.forEach((file) => formData.append("files", file));
    if (video) formData.append("files", video);

    try {
      const res = await fetch("/api/maintenance-request/submit", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as Record<string, string>).error || t("submitFailed"));
        setSubmitting(false);
        return;
      }

      router.push(`/${locale}/maintenance-request/${token}/success`);
    } catch {
      setError(t("submitGenericError"));
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex flex-col items-center justify-center gap-3 p-4">
        <Spinner label={tc("loading")} sizeClassName="h-8 w-8" />
        <p aria-hidden="true" className="text-sm text-text-secondary">
          {tc("loading")}
        </p>
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6 text-center animate-fade-in-up">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/25">
            <AlertTriangle aria-hidden="true" className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary font-display">
            {t("invalidLink")}
          </h1>
          <Alert variant="destructive" className="text-start">
            {t("invalidLinkMessage")}
          </Alert>
          <p className="text-xs text-text-secondary/50 pt-2">
            MPIRE Property Management
          </p>
        </div>
      </div>
    );
  }

  const categories = [
    "plumbing",
    "electrical",
    "ac",
    "structural",
    "painting",
    "cleaning",
    "pest",
    "other",
  ];

  const urgencies = ["low", "medium", "high", "emergency"];

  return (
    <div className="min-h-screen bg-background noise-overlay">
      {/* Header */}
      <header className="border-b border-border/60 bg-surface/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
            <Wrench aria-hidden="true" className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-text-primary font-display truncate">
              {t("title")}
            </h1>
            <p className="text-xs text-text-secondary truncate">{t("subtitle")}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5 stagger-children">
        {/* Property banner */}
        <div className="bg-surface border border-border/60 rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Building2 aria-hidden="true" className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">
              {tokenInfo?.property_name}
            </p>
            <p className="text-xs text-text-secondary">{t("enterUnitPrompt")}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Unit number + Category + Description + Urgency */}
          <div className="bg-surface border border-border/60 rounded-xl p-5 space-y-5">
            {/* Unit Number */}
            <Input
              type="text"
              name="unit_number"
              required
              autoComplete="off"
              label={`${t("unitNumber")} *`}
              placeholder={t("unitNumberPlaceholder")}
              className="font-mono ltr-nums"
            />

            {/* Category */}
            <Select name="category" required label={`${t("selectCategory")} *`}>
              <option value="">{t("selectCategory")}...</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {tm(`categories.${cat}`)}
                </option>
              ))}
            </Select>

            {/* Description */}
            <Textarea
              name="description"
              required
              rows={4}
              label={`${t("describeIssue")} *`}
              placeholder={t("descriptionPlaceholder")}
              className="resize-none"
            />

            {/* Urgency */}
            <fieldset>
              <legend className="text-sm font-medium text-foreground tracking-tight mb-2">
                {t("selectUrgency")} *
              </legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {urgencies.map((urg) => (
                  <label
                    key={urg}
                    className="relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border/60 bg-surface-elevated/50 cursor-pointer transition-all duration-200 hover:border-accent/40 hover:bg-surface-elevated has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
                  >
                    <input
                      type="radio"
                      name="urgency"
                      value={urg}
                      required
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${
                        urg === "low"
                          ? "bg-text-secondary"
                          : urg === "medium"
                          ? "bg-accent"
                          : urg === "high"
                          ? "bg-warning"
                          : "bg-destructive"
                      }`}
                    />
                    <span className="text-xs font-medium text-text-primary capitalize">
                      {tm(`urgencies.${urg}`)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Media Upload */}
          <div className="bg-surface border border-border/60 rounded-xl p-5">
            <MediaUpload
              photos={photos}
              video={video}
              onPhotosChange={setPhotos}
              onVideoChange={setVideo}
              t={t}
            />
          </div>

          {/* Error */}
          {error && <Alert variant="destructive">{error}</Alert>}

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            loading={submitting}
            className="w-full rounded-xl"
          >
            {submitting ? (
              t("submitting")
            ) : (
              <>
                <Send aria-hidden="true" className="h-4 w-4" />
                {t("submit")}
              </>
            )}
          </Button>
        </form>

        {/* Footer */}
        <footer className="text-center py-2">
          <p className="text-xs text-text-secondary/50">
            MPIRE Property Management
          </p>
        </footer>
      </main>
    </div>
  );
}
