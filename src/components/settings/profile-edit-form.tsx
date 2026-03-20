"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Check, X, Lock } from "lucide-react";

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
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
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
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Name field */}
        <div>
          <span className="text-xs text-text-secondary uppercase tracking-wider">{t("name")}</span>
          {editingName ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                autoFocus
              />
              <button
                onClick={handleSaveName}
                disabled={savingName}
                className="p-1.5 rounded-md bg-accent text-background hover:bg-accent-hover transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setEditingName(false); setName(currentName); }}
                className="p-1.5 rounded-md bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-text-primary">{name || "—"}</p>
              {nameSuccess && <Check className="h-3.5 w-3.5 text-success" />}
              <button
                onClick={() => setEditingName(true)}
                className="p-1 rounded text-text-secondary hover:text-accent transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Email field (read-only) */}
        <div>
          <span className="text-xs text-text-secondary uppercase tracking-wider">{t("email")}</span>
          <p className="text-sm text-text-primary mt-1 font-mono">{currentEmail || "—"}</p>
        </div>

        {/* Password change */}
        <div className="sm:col-span-2">
          {editingPassword ? (
            <div className="space-y-3 p-4 bg-surface-elevated/50 border border-border/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-text-secondary" />
                <span className="text-sm font-medium text-text-primary">Change Password</span>
              </div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 characters)"
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSavePassword}
                  disabled={savingPassword}
                  className="h-8 px-4 bg-accent hover:bg-accent-hover text-background text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingPassword ? tc("loading") : "Update Password"}
                </button>
                <button
                  onClick={() => { setEditingPassword(false); setNewPassword(""); setConfirmPassword(""); }}
                  className="h-8 px-4 bg-surface border border-border text-text-secondary text-xs rounded-lg hover:text-text-primary transition-colors"
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingPassword(true)}
                className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors"
              >
                <Lock className="h-3 w-3" />
                Change Password
              </button>
              {passwordSuccess && <span className="text-xs text-success">Password updated!</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
