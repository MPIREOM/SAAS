import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import {
  User,
  Bell,
  Users,
  MessageSquare,
  Mail,
  Activity,
  Bot,
  FileText,
} from "lucide-react";
import { InviteUserForm } from "@/components/settings/invite-user-form";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { UserManagementTable } from "@/components/settings/user-management-table";
import { ProfileEditForm } from "@/components/settings/profile-edit-form";
import { AuditLogViewer } from "@/components/settings/audit-log-viewer";
import { PropertyNotificationToggles } from "@/components/settings/property-notification-toggles";
import { TenantNotificationToggles } from "@/components/settings/tenant-notification-toggles";
import { WhatsAppAgentSetup } from "@/components/settings/whatsapp-agent-setup";
import { AutoInvoiceSettings } from "@/components/settings/auto-invoice-settings";

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
    .select("*, user_property_assignments(property_id, properties(name))")
    .order("created_at", { ascending: false });

  const { data: allProperties } = await supabase
    .from("properties")
    .select("id, name, notifications_enabled")
    .eq("is_archived", false)
    .order("name");

  // Fetch active tenants with their current lease info for notification toggles
  const { data: activeTenants } = await supabase
    .from("tenants")
    .select(
      "id, full_name, phone, notifications_enabled, leases(unit_id, is_active, units(unit_number, properties(name)))"
    )
    .eq("status", "active")
    .order("full_name");

  const isSuperAdmin = profile?.role === "super_admin";
  const propertiesList = (allProperties || []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
  }));

  const tenantsList = (activeTenants || []).map((t) => {
    const leases = t.leases as unknown as Array<{
      is_active: boolean;
      units: { unit_number: string; properties: { name: string } | null } | null;
    }>;
    const activeLease = leases?.find((l) => l.is_active);
    return {
      id: t.id as string,
      full_name: t.full_name as string,
      phone: t.phone as string,
      notifications_enabled: (t.notifications_enabled ?? true) as boolean,
      property_name: (activeLease?.units?.properties?.name as string) || undefined,
      unit_number: (activeLease?.units?.unit_number as string) || undefined,
    };
  });

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
        <ProfileEditForm
          userId={user?.id || ""}
          currentName={(profile?.full_name as string) || ""}
          currentEmail={user?.email || ""}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/50">
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
              user_property_assignments: Array<{
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

      {/* Property Notifications */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <MessageSquare className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              {t("propertyNotifications")}
            </h2>
            <p className="text-xs text-text-secondary">
              {t("propertyNotificationsDescription")}
            </p>
          </div>
        </div>
        <PropertyNotificationToggles
          properties={(allProperties || []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            notifications_enabled: p.notifications_enabled as boolean,
          }))}
        />
      </div>

      {/* Tenant Notifications */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              {t("tenantNotifications")}
            </h2>
            <p className="text-xs text-text-secondary">
              {t("tenantNotificationsDescription")}
            </p>
          </div>
        </div>
        <TenantNotificationToggles tenants={tenantsList} />
      </div>

      {/* Activity Log */}
      {isSuperAdmin && (
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-accent/10 rounded-md">
              <Activity className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-medium text-text-primary font-display">
                Activity Log
              </h2>
              <p className="text-xs text-text-secondary">
                Recent actions across the system
              </p>
            </div>
          </div>
          <AuditLogViewer />
        </div>
      )}

      {/* Auto Invoice Settings */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <FileText className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              Auto Invoice Generation
            </h2>
            <p className="text-xs text-text-secondary">
              Control when invoices are automatically created for active leases
            </p>
          </div>
        </div>
        <AutoInvoiceSettings />
      </div>

      {/* WhatsApp AI Agent */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <Bot className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary font-display">
              WhatsApp AI Agent
            </h2>
            <p className="text-xs text-text-secondary">
              Register your WhatsApp number to manage invoices and expenses via chat
            </p>
          </div>
        </div>
        <WhatsAppAgentSetup
          userId={user?.id || ""}
          currentPhone={(profile?.whatsapp_phone as string) || null}
          notificationPhones={
            (profile?.notification_phones as string[] | null) || []
          }
        />
      </div>

      {/* WhatsApp Test */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
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
          <a
            href={`/${locale}/settings/whatsapp-test`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            Test WhatsApp
          </a>
        </div>
        <p className="text-sm text-text-secondary">
          Send a test message via Meta WhatsApp Cloud API to verify your credentials are working.
        </p>
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
