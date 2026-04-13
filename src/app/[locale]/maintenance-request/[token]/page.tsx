"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wrench, Send, AlertTriangle, Building2 } from "lucide-react";
import { MediaUpload } from "@/components/maintenance/media-upload";

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
        setError((data as Record<string, string>).error || "Failed to submit request");
        setSubmitting(false);
        return;
      }

      router.push(`/${locale}/maintenance-request/${token}/success`);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-background noise-overlay flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary font-display">
            {t("invalidLink")}
          </h1>
          <p className="text-sm text-text-secondary">
            {t("invalidLinkMessage")}
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
      <div className="border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Wrench className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-primary font-display">
              {t("title")}
            </h1>
            <p className="text-xs text-text-secondary">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Property banner */}
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {tokenInfo?.property_name}
            </p>
            <p className="text-xs text-text-secondary">
              {t("enterUnitPrompt")}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Unit number + Category + Description + Urgency */}
          <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
            {/* Unit Number */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                {t("unitNumber")} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="unit_number"
                required
                autoComplete="off"
                placeholder={t("unitNumberPlaceholder")}
                className="w-full h-10 bg-surface-elevated border border-border rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                {t("selectCategory")} <span className="text-destructive">*</span>
              </label>
              <select
                name="category"
                required
                className="w-full h-10 bg-surface-elevated border border-border rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">{t("selectCategory")}...</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {tm(`categories.${cat}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                {t("describeIssue")} <span className="text-destructive">*</span>
              </label>
              <textarea
                name="description"
                required
                rows={4}
                placeholder={t("descriptionPlaceholder")}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
              />
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                {t("selectUrgency")} <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {urgencies.map((urg) => (
                  <label
                    key={urg}
                    className="relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-surface-elevated cursor-pointer hover:border-accent/40 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                  >
                    <input
                      type="radio"
                      name="urgency"
                      value={urg}
                      required
                      className="sr-only"
                    />
                    <span
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
            </div>
          </div>

          {/* Media Upload */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <MediaUpload
              photos={photos}
              video={video}
              onPhotosChange={setPhotos}
              onVideoChange={setVideo}
              t={t}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 bg-accent hover:bg-accent-hover text-background font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                {t("submitting")}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {t("submit")}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
