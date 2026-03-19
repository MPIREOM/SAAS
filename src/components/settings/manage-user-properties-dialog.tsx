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
            <div className="bg-accent/5 border border-accent/20 rounded-md p-3">
              <p className="text-sm text-accent">
                {t("superAdminAllAccess")}
              </p>
            </div>
          ) : allProperties.length === 0 ? (
            <div className="bg-surface-elevated border border-border rounded-md p-3">
              <p className="text-sm text-text-secondary">
                {t("noPropertiesAvailable")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  {t("selectAll")}
                </button>
                <span className="text-text-secondary text-xs">/</span>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  {t("selectNone")}
                </button>
                <span className="text-xs text-text-secondary ms-auto">
                  {selected.size} / {allProperties.length}
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {allProperties.map((property) => {
                  const isSelected = selected.has(property.id);
                  return (
                    <button
                      key={property.id}
                      type="button"
                      onClick={() => toggle(property.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-start transition-colors ${
                        isSelected
                          ? "bg-accent/5"
                          : "hover:bg-surface-elevated/50"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-accent border-accent"
                            : "border-border"
                        }`}
                      >
                        {isSelected && (
                          <Check className="h-3 w-3 text-background" />
                        )}
                      </div>
                      <Building2 className="h-4 w-4 text-text-secondary flex-shrink-0" />
                      <span className="text-sm text-text-primary truncate">
                        {property.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive mt-3">{error}</p>
          )}
        </DialogBody>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 px-3 bg-surface border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
          >
            {tc("cancel")}
          </button>
          {!isSuperAdmin && (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="h-8 px-3 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {loading ? tc("loading") : tc("save")}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
