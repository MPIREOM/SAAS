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
import { UserManagementTable } from "@/components/settings/user-management-table";

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

  const { data: allProperties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("is_archived", false)
    .order("name");

  const isSuperAdmin = profile?.role === "super_admin";
  const propertiesList = (allProperties || []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
  }));

  return (
    <div className="space-y-8 max-w-4xl stagger-children">
      <div className="animate-fade-in-up">
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
          <InviteUserForm properties={propertiesList} />
        </div>

        {allUsers && allUsers.length > 0 ? (
          <UserManagementTable
            users={(allUsers as Array<{
              id: string;
              full_name: string | null;
              email: string;
              role: string;
              is_active: boolean;
              user_property_access: Array<{
                property_id: string;
                properties: { name: string } | null;
              }> | null;
            }>)}
            allProperties={propertiesList}
            isSuperAdmin={isSuperAdmin}
          />
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
