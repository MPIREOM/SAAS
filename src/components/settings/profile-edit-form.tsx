"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Check, X, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

interface ProfileEditFormProps {
  userId: string;
  currentName: string;
  currentEmail: string;
}

export function ProfileEditForm({ userId, currentName, currentEmail }: ProfileEditFormProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [editingName, setEditingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [name, setName] = useState(currentName);
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSaveName() {
    if (!name.trim()) return;
    setSavingName(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({ full_name: name.trim() })
      .eq("id", userId);
    if (updateError) {
      setError(updateError.message);
    } else {
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 2000);
      setEditingName(false);
    }
    setSavingName(false);
  }

  async function handleSavePassword() {
    if (newPassword.length < 8) {
      setError(t("passwordMinLength"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordsNoMatch"));
      return;
    }
    setSavingPassword(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      setError(updateError.message);
    } else {
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 2000);
      setNewPassword("");
      setConfirmPassword("");
      setEditingPassword(false);
    }
    setSavingPassword(false);
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Name field */}
        <div>
          <span className="text-xs uppercase tracking-wider text-text-secondary">
            {t("name")}
          </span>
          {editingName ? (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1">
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label={t("name")}
                  className="h-9"
                  autoFocus
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveName}
                loading={savingName}
                aria-label={tc("save")}
                className="h-9 w-9 shrink-0 p-0"
              >
                {!savingName && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setEditingName(false); setName(currentName); }}
                aria-label={tc("cancel")}
                className="h-9 w-9 shrink-0 p-0 text-text-secondary hover:text-text-primary"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-2">
              <p className="text-sm text-text-primary">{name || "—"}</p>
              {nameSuccess && (
                <Check
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-success"
                />
              )}
              <button
                type="button"
                onClick={() => setEditingName(true)}
                aria-label={tc("edit")}
                className="cursor-pointer rounded p-1 text-text-secondary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Pencil aria-hidden="true" className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Email field (read-only) */}
        <div>
          <span className="text-xs uppercase tracking-wider text-text-secondary">
            {t("email")}
          </span>
          <p className="mt-1.5 font-mono text-sm text-text-primary">
            {currentEmail || "—"}
          </p>
        </div>

        {/* Password change */}
        <div className="sm:col-span-2">
          {editingPassword ? (
            <div className="space-y-3 rounded-lg border border-border/50 bg-surface-elevated/50 p-4">
              <div className="flex items-center gap-2">
                <Lock aria-hidden="true" className="h-4 w-4 text-accent" />
                <span className="font-display text-sm font-medium text-text-primary">
                  {t("changePassword")}
                </span>
              </div>
              <Input
                type="password"
                label={t("newPassword")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                helperText={t("passwordMinLength")}
              />
              <Input
                type="password"
                label={t("confirmNewPassword")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSavePassword}
                  loading={savingPassword}
                >
                  {t("updatePassword")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditingPassword(false); setNewPassword(""); setConfirmPassword(""); }}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingPassword(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded text-xs text-text-secondary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Lock aria-hidden="true" className="h-3 w-3" />
                {t("changePassword")}
              </button>
              {passwordSuccess && (
                <span role="status" className="text-xs text-success">
                  {t("passwordUpdated")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
