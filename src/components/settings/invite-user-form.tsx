"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus, X } from "lucide-react";

export function InviteUserForm() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const body = {
      email: formData.get("email"),
      full_name: formData.get("full_name"),
      role: formData.get("role"),
    };

    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || tc("error"));
        setLoading(false);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError(tc("error"));
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-8 px-3 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors"
      >
        <UserPlus className="h-3.5 w-3.5" />
        {t("addUser")}
      </button>
    );
  }

  return (
    <div className="bg-surface-elevated border border-border rounded-md p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-primary font-display">{t("inviteNewUser")}</h3>
        <button
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-border/30 transition-colors"
        >
          <X className="h-3.5 w-3.5 text-text-secondary" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t("email")} <span className="text-destructive">*</span>
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              className="w-full h-9 bg-surface border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t("name")}
            </label>
            <input
              name="full_name"
              className="w-full h-9 bg-surface border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-1">
            {t("role")} <span className="text-destructive">*</span>
          </label>
          <select
            name="role"
            required
            defaultValue="property_manager"
            className="w-full h-9 bg-surface border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
          >
            <option value="property_manager">{t("propertyManager")}</option>
            <option value="super_admin">{t("superAdmin")}</option>
          </select>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="h-8 px-3 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? tc("loading") : t("inviteUser")}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError("");
            }}
            className="h-8 px-3 bg-surface border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            {tc("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
