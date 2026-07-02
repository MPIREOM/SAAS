"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus, Building2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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

  const close = () => {
    setOpen(false);
    setError("");
    setSelectedProperties(new Set());
    setRole("property_manager");
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

  const showPropertySelection = role !== "super_admin" && properties.length > 0;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
        {t("addUser")}
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("inviteNewUser")}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  name="email"
                  type="email"
                  required
                  label={`${t("email")} *`}
                  placeholder="user@example.com"
                />
                <Input name="full_name" label={t("name")} />
              </div>

              <Select
                label={`${t("role")} *`}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="property_manager">{t("propertyManager")}</option>
                <option value="super_admin">{t("superAdmin")}</option>
              </Select>

              {showPropertySelection && (
                <div>
                  <p className="mb-1.5 text-sm font-medium tracking-tight text-foreground">
                    {t("assignProperties")}
                  </p>
                  <div className="max-h-40 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/60">
                    {properties.map((property) => {
                      const isSelected = selectedProperties.has(property.id);
                      return (
                        <button
                          key={property.id}
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          onClick={() => toggleProperty(property.id)}
                          className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
                            isSelected ? "bg-accent/5" : "hover:bg-surface-elevated/60"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                              isSelected
                                ? "border-accent bg-accent"
                                : "border-border"
                            }`}
                          >
                            {isSelected && (
                              <Check className="h-2.5 w-2.5 text-background" />
                            )}
                          </span>
                          <Building2
                            aria-hidden="true"
                            className="h-3.5 w-3.5 flex-shrink-0 text-text-secondary"
                          />
                          <span className="truncate text-sm text-text-primary">
                            {property.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedProperties.size > 0 && (
                    <p className="mt-1.5 text-xs text-text-secondary">
                      <span className="ltr-nums font-mono">{selectedProperties.size}</span>{" "}
                      {t("propertiesSelected")}
                    </p>
                  )}
                </div>
              )}

              {error && <Alert variant="destructive">{error}</Alert>}
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="secondary" size="sm" onClick={close}>
                {tc("cancel")}
              </Button>
              <Button type="submit" size="sm" loading={loading}>
                {t("inviteUser")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
