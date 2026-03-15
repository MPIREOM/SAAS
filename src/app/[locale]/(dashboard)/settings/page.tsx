import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import {
  User,
  Bell,
  Users,
  MessageSquare,
  Mail,
} from "lucide-react";
import { InviteUserForm } from "@/components/settings/invite-user-form";
import { NotificationPreferences } from "@/components/settings/notification-preferences";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user?.id)
    .single();

  const { data: allUsers } = await supabase
    .from("users")
    .select("*, user_property_access(property_id, properties(name))")
    .order("created_at", { ascending: false });

  const roleColors: Record<string, string> = {
    admin: "bg-accent/10 text-accent",
    manager: "bg-warning/10 text-warning",
    viewer: "bg-text-secondary/10 text-text-secondary",
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary font-display">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t("subtitle")}
        </p>
      </div>

      {/* Profile Section */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <User className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              {t("profile")}
            </h2>
            <p className="text-xs text-text-secondary">
              {t("profileDescription")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-text-secondary uppercase tracking-wider">
              {t("name")}
            </span>
            <p className="text-sm text-text-primary mt-1">
              {(profile?.full_name as string) || user?.email || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-secondary uppercase tracking-wider">
              {t("email")}
            </span>
            <p className="text-sm text-text-primary mt-1 font-mono">
              {user?.email || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-secondary uppercase tracking-wider">
              {t("role")}
            </span>
            <p className="text-sm text-text-primary mt-1 capitalize">
              {(profile?.role as string) || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-secondary uppercase tracking-wider">
              {t("memberSince")}
            </span>
            <p className="text-sm text-text-primary mt-1 font-mono ltr-nums">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString()
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <Bell className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              {t("notificationPreferences")}
            </h2>
            <p className="text-xs text-text-secondary">
              {t("notificationPreferencesDescription")}
            </p>
          </div>
        </div>
        <NotificationPreferences />
      </div>

      {/* User Management */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-md">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-medium text-text-primary font-display">
                {t("userManagement")}
              </h2>
              <p className="text-xs text-text-secondary">
                {t("userManagementDescription")}
              </p>
            </div>
          </div>
          <InviteUserForm />
        </div>

        {allUsers && allUsers.length > 0 ? (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allUsers.map((u: Record<string, unknown>) => {
                  const access = u.user_property_access as Record<string, unknown>[] | null;

                  return (
                    <tr
                      key={u.id as string}
                      className="hover:bg-surface-elevated/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-text-primary">
                          {(u.full_name as string) || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary font-mono">
                          {(u.email as string) || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                            roleColors[(u.role as string) || "viewer"]
                          }`}
                        >
                          {u.role as string}
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
                          {access && access.length > 0
                            ? access
                                .map(
                                  (a) =>
                                    (a.properties as Record<string, unknown>)
                                      ?.name as string
                                )
                                .filter(Boolean)
                                .join(", ")
                            : t("allProperties")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface-elevated border border-border rounded-md p-4">
            <p className="text-sm text-text-secondary">{t("noUsersFound")}</p>
          </div>
        )}
      </div>

      {/* WhatsApp Configuration */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <MessageSquare className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              {t("whatsappConfig")}
            </h2>
            <p className="text-xs text-text-secondary">
              {t("whatsappConfigDescription")}
            </p>
          </div>
        </div>
        <div className="bg-surface-elevated border border-border rounded-md p-4">
          <p className="text-sm text-text-secondary">
            {t("whatsappComingSoon")}
          </p>
        </div>
      </div>

      {/* Email Configuration */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <Mail className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              {t("emailConfig")}
            </h2>
            <p className="text-xs text-text-secondary">
              {t("emailConfigDescription")}
            </p>
          </div>
        </div>
        <div className="bg-surface-elevated border border-border rounded-md p-4">
          <p className="text-sm text-text-secondary">
            {t("emailComingSoon")}
          </p>
        </div>
      </div>
    </div>
  );
}
