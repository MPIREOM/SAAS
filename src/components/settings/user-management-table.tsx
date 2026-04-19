"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings2, Send } from "lucide-react";
import { ManageUserPropertiesDialog } from "./manage-user-properties-dialog";

interface Property {
  id: string;
  name: string;
}

interface UserRow {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_active: boolean;
  user_property_assignments: Array<{
    property_id: string;
    properties: { name: string } | null;
  }> | null;
}

interface UserManagementTableProps {
  users: UserRow[];
  allProperties: Property[];
  isSuperAdmin: boolean;
  currentUserId: string;
}

export function UserManagementTable({
  users,
  allProperties,
  isSuperAdmin,
  currentUserId,
}: UserManagementTableProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ userId: string; ok: boolean; message: string } | null>(null);

  const handleResendInvite = async (userId: string) => {
    setResendingId(userId);
    setFeedback(null);
    try {
      const res = await fetch("/api/users/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ userId, ok: true, message: t("resendInviteSent") });
      } else {
        setFeedback({ userId, ok: false, message: data.error || t("resendInviteFailed") });
      }
    } catch {
      setFeedback({ userId, ok: false, message: tc("error") });
    } finally {
      setResendingId(null);
    }
  };

  const roleColors: Record<string, string> = {
    super_admin: "bg-accent/10 text-accent",
    property_manager: "bg-warning/10 text-warning",
  };

  const openManageProperties = (user: UserRow) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                {t("name")}
              </th>
              <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                {t("email")}
              </th>
              <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                {t("role")}
              </th>
              <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                {t("users")}
              </th>
              <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                {t("properties")}
              </th>
              {isSuperAdmin && (
                <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5 w-10" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const access = u.user_property_assignments;
              return (
                <tr
                  key={u.id}
                  className="hover:bg-surface-elevated/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-text-primary">
                      {u.full_name || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-secondary font-mono">
                      {u.email || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        roleColors[u.role] || "bg-text-secondary/10 text-text-secondary"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        u.is_active
                          ? "bg-success/10 text-success"
                          : "bg-text-secondary/10 text-text-secondary"
                      }`}
                    >
                      {u.is_active ? t("active") : t("inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-secondary">
                      {u.role === "super_admin"
                        ? t("allProperties")
                        : access && access.length > 0
                          ? access
                              .map((a) => a.properties?.name)
                              .filter(Boolean)
                              .join(", ")
                          : t("noPropertiesAssigned")}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {u.role !== "super_admin" && (
                          <button
                            type="button"
                            onClick={() => openManageProperties(u)}
                            title={t("managePropertyAccess")}
                            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-border/30 text-text-secondary hover:text-accent transition-colors"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {u.id !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => handleResendInvite(u.id)}
                            disabled={resendingId === u.id}
                            title={t("resendInvite")}
                            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-border/30 text-text-secondary hover:text-accent transition-colors disabled:opacity-50"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {feedback?.userId === u.id && (
                        <p
                          className={`text-xs mt-1 ${
                            feedback.ok ? "text-success" : "text-destructive"
                          }`}
                        >
                          {feedback.message}
                        </p>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <ManageUserPropertiesDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          userId={selectedUser.id}
          userName={selectedUser.full_name || selectedUser.email}
          userRole={selectedUser.role}
          currentPropertyIds={
            selectedUser.user_property_assignments?.map((a) => a.property_id) || []
          }
          allProperties={allProperties}
        />
      )}
    </>
  );
}
