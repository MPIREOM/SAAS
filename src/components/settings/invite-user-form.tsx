"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus, X, Building2, Check } from "lucide-react";

interface Property {
  id: string;
  name: string;
}

interface InviteUserFormProps {
  properties: Property[];
}

export function InviteUserForm({ properties }: InviteUserFormProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState("property_manager");
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(new Set());
  const router = useRouter();

  const toggleProperty = (id: string) => {
    setSelectedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const body = {
      email: formData.get("email"),
      full_name: formData.get("full_name"),
      role,
      property_ids: role !== "super_admin" ? Array.from(selectedProperties) : [],
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
      setSelectedProperties(new Set());
      setRole("property_manager");
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

  const showPropertySelection = role !== "super_admin" && properties.length > 0;

  return (
    <div className="bg-surface-elevated border border-border rounded-md p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-primary font-display">{t("inviteNewUser")}</h3>
        <button
          onClick={() => {
            setOpen(false);
            setError("");
            setSelectedProperties(new Set());
            setRole("property_manager");
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
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full h-9 bg-surface border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
          >
            <option value="property_manager">{t("propertyManager")}</option>
            <option value="super_admin">{t("superAdmin")}</option>
          </select>
        </div>

        {showPropertySelection && (
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              {t("assignProperties")}
            </label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {properties.map((property) => {
                const isSelected = selectedProperties.has(property.id);
                return (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => toggleProperty(property.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-start transition-colors ${
                      isSelected
                        ? "bg-accent/5"
                        : "hover:bg-surface/50"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 h-3.5 w-3.5 rounded border flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-accent border-accent"
                          : "border-border"
                      }`}
                    >
                      {isSelected && (
                        <Check className="h-2.5 w-2.5 text-background" />
                      )}
                    </div>
                    <Building2 className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
                    <span className="text-sm text-text-primary truncate">
                      {property.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedProperties.size > 0 && (
              <p className="text-xs text-text-secondary mt-1">
                {selectedProperties.size} {t("propertiesSelected")}
              </p>
            )}
          </div>
        )}

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
              setSelectedProperties(new Set());
              setRole("property_manager");
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
