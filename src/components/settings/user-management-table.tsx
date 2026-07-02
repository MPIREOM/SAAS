"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings2, Send } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  invited_at: string | null;
  last_sign_in_at: string | null;
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

  const openManageProperties = (user: UserRow) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const roleLabel = (role: string) =>
    role === "super_admin"
      ? t("superAdmin")
      : role === "property_manager"
        ? t("propertyManager")
        : role;

  const renderRoleBadge = (role: string) => (
    <Badge
      variant={
        role === "super_admin"
          ? "default"
          : role === "property_manager"
            ? "warning"
            : "secondary"
      }
    >
      {roleLabel(role)}
    </Badge>
  );

  const renderStatusBadge = (u: UserRow) => (
    <Badge variant={u.is_active ? "success" : "secondary"}>
      {u.is_active ? t("active") : t("inactive")}
    </Badge>
  );

  const renderInviteBadge = (u: UserRow) =>
    u.last_sign_in_at ? (
      <Badge variant="success">{t("inviteAccepted")}</Badge>
    ) : u.invited_at ? (
      <Badge variant="warning" title={new Date(u.invited_at).toLocaleString()}>
        {t("invitePending")} ·{" "}
        <span className="ltr-nums font-mono">
          {new Date(u.invited_at).toLocaleDateString()}
        </span>
      </Badge>
    ) : (
      <Badge variant="secondary">{t("inviteNotSent")}</Badge>
    );

  const propertiesText = (u: UserRow) => {
    const access = u.user_property_assignments;
    return u.role === "super_admin"
      ? t("allProperties")
      : access && access.length > 0
        ? access
            .map((a) => a.properties?.name)
            .filter(Boolean)
            .join(", ")
        : t("noPropertiesAssigned");
  };

  const renderActions = (u: UserRow) =>
    isSuperAdmin ? (
      <div className="flex items-center gap-1">
        {u.role !== "super_admin" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openManageProperties(u)}
            title={t("managePropertyAccess")}
            aria-label={t("managePropertyAccess")}
            className="h-8 w-8 p-0 text-text-secondary hover:text-accent"
          >
            <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        )}
        {u.id !== currentUserId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleResendInvite(u.id)}
            disabled={resendingId === u.id}
            loading={resendingId === u.id}
            title={t("resendInvite")}
            aria-label={t("resendInvite")}
            className="h-8 w-8 p-0 text-text-secondary hover:text-accent"
          >
            {resendingId !== u.id && (
              <Send aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    ) : null;

  const renderFeedback = (u: UserRow) =>
    feedback?.userId === u.id ? (
      <p
        role="status"
        className={`mt-1 text-xs ${
          feedback.ok ? "text-success" : "text-destructive"
        }`}
      >
        {feedback.message}
      </p>
    ) : null;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-border/50 md:block">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("email")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead>{tc("status")}</TableHead>
              <TableHead>{t("invitation")}</TableHead>
              <TableHead>{t("properties")}</TableHead>
              {isSuperAdmin && (
                <TableHead className="w-20 text-end">
                  <span className="sr-only">{tc("actions")}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <span className="text-sm font-medium text-text-primary">
                    {u.full_name || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-text-secondary">
                    {u.email || "—"}
                  </span>
                </TableCell>
                <TableCell>{renderRoleBadge(u.role)}</TableCell>
                <TableCell>{renderStatusBadge(u)}</TableCell>
                <TableCell>{renderInviteBadge(u)}</TableCell>
                <TableCell>
                  <span className="text-sm text-text-secondary">
                    {propertiesText(u)}
                  </span>
                </TableCell>
                {isSuperAdmin && (
                  <TableCell className="text-end">
                    {renderActions(u)}
                    {renderFeedback(u)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <ul className="space-y-2 md:hidden">
        {users.map((u) => (
          <li
            key={`m-${u.id}`}
            className="rounded-lg border border-border/50 bg-surface-elevated/40 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {u.full_name || "—"}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-text-secondary">
                  {u.email || "—"}
                </p>
              </div>
              {renderActions(u)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {renderRoleBadge(u.role)}
              {renderStatusBadge(u)}
              {renderInviteBadge(u)}
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              <span className="uppercase tracking-wider">{t("properties")}:</span>{" "}
              {propertiesText(u)}
            </p>
            {renderFeedback(u)}
          </li>
        ))}
      </ul>

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
