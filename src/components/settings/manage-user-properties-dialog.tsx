"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

interface Property {
  id: string;
  name: string;
}

interface ManageUserPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userRole: string;
  currentPropertyIds: string[];
  allProperties: Property[];
}

export function ManageUserPropertiesDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userRole,
  currentPropertyIds,
  allProperties,
}: ManageUserPropertiesDialogProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set(currentPropertyIds));
      setError("");
    }
  }, [open, currentPropertyIds]);

  const isSuperAdmin = userRole === "super_admin";

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(allProperties.map((p) => p.id)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/users/${userId}/properties`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyIds: Array.from(selected) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || tc("error"));
        setLoading(false);
        return;
      }

      onOpenChange(false);
      router.refresh();
    } catch {
      setError(tc("error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("managePropertyAccess")}</DialogTitle>
          <DialogDescription>
            {t("managePropertyAccessDescription", { name: userName })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isSuperAdmin ? (
            <Alert variant="info">{t("superAdminAllAccess")}</Alert>
          ) : allProperties.length === 0 ? (
            <Alert variant="warning">{t("noPropertiesAvailable")}</Alert>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={selectAll}
                  className="cursor-pointer rounded text-xs font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {t("selectAll")}
                </button>
                <span aria-hidden="true" className="text-xs text-text-secondary/50">
                  /
                </span>
                <button
                  type="button"
                  onClick={selectNone}
                  className="cursor-pointer rounded text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {t("selectNone")}
                </button>
                <span className="ltr-nums ms-auto font-mono text-xs text-text-secondary">
                  {selected.size} / {allProperties.length}
                </span>
              </div>

              <div className="max-h-64 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/60">
                {allProperties.map((property) => {
                  const isSelected = selected.has(property.id);
                  return (
                    <button
                      key={property.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => toggle(property.id)}
                      className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
                        isSelected ? "bg-accent/5" : "hover:bg-surface-elevated/50"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                          isSelected ? "border-accent bg-accent" : "border-border"
                        }`}
                      >
                        {isSelected && (
                          <Check className="h-3 w-3 text-background" />
                        )}
                      </span>
                      <Building2
                        aria-hidden="true"
                        className="h-4 w-4 flex-shrink-0 text-text-secondary"
                      />
                      <span className="truncate text-sm text-text-primary">
                        {property.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mt-3">
              {error}
            </Alert>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {tc("cancel")}
          </Button>
          {!isSuperAdmin && (
            <Button type="button" size="sm" onClick={handleSave} loading={loading}>
              {tc("save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
