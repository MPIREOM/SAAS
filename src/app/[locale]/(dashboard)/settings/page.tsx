import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getAuthContext } from "@/lib/access-control";
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
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InviteUserForm } from "@/components/settings/invite-user-form";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { UserManagementTable } from "@/components/settings/user-management-table";
import { ProfileEditForm } from "@/components/settings/profile-edit-form";
import { AuditLogViewer } from "@/components/settings/audit-log-viewer";
import { PropertyNotificationToggles } from "@/components/settings/property-notification-toggles";
import { TenantNotificationToggles } from "@/components/settings/tenant-notification-toggles";
import { WhatsAppAgentSetup } from "@/components/settings/whatsapp-agent-setup";
import { AutoInvoiceSettings } from "@/components/settings/auto-invoice-settings";
import { PropertyMaintenanceLinks } from "@/components/settings/property-maintenance-links";

/** Presentational section card shared by every settings block. */
function SettingsSection({
  id,
  icon,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-24 rounded-xl border border-border/60 bg-surface p-5 sm:p-6"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-lg bg-accent/10 p-2" aria-hidden="true">
            {icon}
          </div>
          <div className="min-w-0">
            <h2
              id={`${id}-heading`}
              className="font-display text-base font-semibold tracking-tight text-text-primary"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
          </div>
        </div>
        {action && <div className="sm:shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings");
  const tMaint = await getTranslations("maintenanceRequest");
  const supabase = await createClient();

  // Request-cached session context (no network call to the Auth server)
  const context = await getAuthContext();
  const userId = context?.userId || "";
  const isSuperAdmin = context?.role === "super_admin";

  // Pull auth-side timestamps (invited_at, last_sign_in_at) so we can show
  // which users have a pending invite vs. have accepted. The `users` table
  // doesn't track this — Supabase Auth does.
  const authMapPromise: Promise<
    Map<string, { invited_at: string | null; last_sign_in_at: string | null }>
  > = (async () => {
    const map = new Map<
      string,
      { invited_at: string | null; last_sign_in_at: string | null }
    >();
    if (!isSuperAdmin) return map;
    try {
      const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: authList } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });
      for (const u of authList?.users ?? []) {
        map.set(u.id, {
          invited_at: u.invited_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
    } catch (err) {
      console.error("Failed to fetch auth users for invite status:", err);
    }
    return map;
  })();

  // All independent lookups load in one parallel batch
  const [
    { data: profile },
    { data: allUsers },
    { data: allProperties },
    { data: activeTenants },
    authMap,
  ] = await Promise.all([
    supabase.from("users").select("*").eq("id", userId).single(),
    supabase
      .from("users")
      .select("*, user_property_assignments(property_id, properties(name))")
      .order("created_at", { ascending: false }),
    supabase
      .from("properties")
      .select("id, name, notifications_enabled")
      .eq("is_archived", false)
      .order("name"),
    // Active tenants with their current lease info for notification toggles
    supabase
      .from("tenants")
      .select(
        "id, full_name, phone, notifications_enabled, leases(unit_id, is_active, units(unit_number, properties(name)))"
      )
      .eq("status", "active")
      .order("full_name"),
    authMapPromise,
  ]);
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

  const roleLabel =
    profile?.role === "super_admin"
      ? t("superAdmin")
      : profile?.role === "property_manager"
        ? t("propertyManager")
        : (profile?.role as string) || null;

  // Purely presentational in-page anchors (hash links only, no routing).
  const anchors: Array<{ id: string; label: string }> = [
    { id: "profile", label: t("profile") },
    { id: "notifications", label: t("notifications") },
    { id: "users", label: t("users") },
    { id: "whatsapp-agent", label: t("whatsappNotification") },
    ...(isSuperAdmin
      ? [{ id: "activity", label: t("activityLogTitle") }]
      : []),
  ];

  return (
    <div className="max-w-4xl space-y-6 stagger-children">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {/* Section shortcuts (presentational hash anchors) */}
      <nav
        aria-label={t("title")}
        className="animate-fade-in-up -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {anchors.map((anchor) => (
          <a
            key={anchor.id}
            href={`#${anchor.id}`}
            className="shrink-0 whitespace-nowrap rounded-full border border-border/60 bg-surface px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {anchor.label}
          </a>
        ))}
      </nav>

      {/* Profile */}
      <SettingsSection
        id="profile"
        icon={<User className="h-5 w-5 text-accent" />}
        title={t("profile")}
        description={t("profileDescription")}
      >
        <ProfileEditForm
          userId={userId}
          currentName={(profile?.full_name as string) || ""}
          currentEmail={context?.email || ""}
        />
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border/40 pt-5 sm:grid-cols-2">
          <div>
            <span className="text-xs uppercase tracking-wider text-text-secondary">
              {t("role")}
            </span>
            <div className="mt-1.5">
              {roleLabel ? (
                <Badge variant={isSuperAdmin ? "default" : "secondary"}>
                  {roleLabel}
                </Badge>
              ) : (
                <p className="text-sm text-text-primary">—</p>
              )}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-text-secondary">
              {t("memberSince")}
            </span>
            <p className="ltr-nums mt-1.5 font-mono text-sm text-text-primary">
              {profile?.created_at
                ? new Date(profile.created_at as string).toLocaleDateString()
                : "—"}
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Notification Preferences */}
      <SettingsSection
        id="notifications"
        icon={<Bell className="h-5 w-5 text-accent" />}
        title={t("notificationPreferences")}
        description={t("notificationPreferencesDescription")}
      >
        <NotificationPreferences />
      </SettingsSection>

      {/* User Management */}
      <SettingsSection
        id="users"
        icon={<Users className="h-5 w-5 text-accent" />}
        title={t("userManagement")}
        description={t("userManagementDescription")}
        action={<InviteUserForm properties={propertiesList} />}
      >
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
            }>).map((u) => {
              const auth = authMap.get(u.id);
              return {
                ...u,
                invited_at: auth?.invited_at ?? null,
                last_sign_in_at: auth?.last_sign_in_at ?? null,
              };
            })}
            allProperties={propertiesList}
            isSuperAdmin={isSuperAdmin}
            currentUserId={userId}
          />
        ) : (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={t("noUsersFound")}
            className="py-10"
          />
        )}
      </SettingsSection>

      {/* Property Notifications */}
      <SettingsSection
        id="property-notifications"
        icon={<MessageSquare className="h-5 w-5 text-accent" />}
        title={t("propertyNotifications")}
        description={t("propertyNotificationsDescription")}
      >
        <PropertyNotificationToggles
          properties={(allProperties || []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            notifications_enabled: p.notifications_enabled as boolean,
          }))}
        />
      </SettingsSection>

      {/* Tenant Notifications */}
      <SettingsSection
        id="tenant-notifications"
        icon={<Users className="h-5 w-5 text-accent" />}
        title={t("tenantNotifications")}
        description={t("tenantNotificationsDescription")}
      >
        <TenantNotificationToggles tenants={tenantsList} />
      </SettingsSection>

      {/* Property Maintenance Links */}
      <SettingsSection
        id="maintenance-links"
        icon={<Wrench className="h-5 w-5 text-accent" />}
        title={tMaint("propertyLinks")}
        description={tMaint("propertyLinksDescription")}
      >
        <PropertyMaintenanceLinks properties={propertiesList} locale={locale} />
      </SettingsSection>

      {/* Activity Log */}
      {isSuperAdmin && (
        <SettingsSection
          id="activity"
          icon={<Activity className="h-5 w-5 text-accent" />}
          title={t("activityLogTitle")}
          description={t("activityLogDescription")}
        >
          <AuditLogViewer />
        </SettingsSection>
      )}

      {/* Auto Invoice Settings */}
      <SettingsSection
        id="auto-invoice"
        icon={<FileText className="h-5 w-5 text-accent" />}
        title={t("autoInvoiceTitle")}
        description={t("autoInvoiceDescription")}
      >
        <AutoInvoiceSettings />
      </SettingsSection>

      {/* WhatsApp AI Agent */}
      <SettingsSection
        id="whatsapp-agent"
        icon={<Bot className="h-5 w-5 text-accent" />}
        title={t("whatsappAgentTitle")}
        description={t("whatsappAgentDescription")}
      >
        <WhatsAppAgentSetup
          userId={userId}
          currentPhone={(profile?.whatsapp_phone as string) || null}
          notificationPhones={
            (profile?.notification_phones as string[] | null) || []
          }
        />
      </SettingsSection>

      {/* WhatsApp Test */}
      <SettingsSection
        id="whatsapp-test"
        icon={<MessageSquare className="h-5 w-5 text-accent" />}
        title={t("whatsappConfig")}
        description={t("whatsappConfigDescription")}
        action={
          <a
            href={`/${locale}/settings/whatsapp-test`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-surface-elevated px-4 text-sm font-semibold text-text-primary transition-all duration-200 hover:border-accent/30 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <MessageSquare aria-hidden="true" className="h-4 w-4 text-accent" />
            {t("testWhatsapp")}
          </a>
        }
      >
        <p className="text-sm text-text-secondary">
          {t("whatsappTestDescription")}
        </p>
      </SettingsSection>

      {/* Email Configuration */}
      <SettingsSection
        id="email"
        icon={<Mail className="h-5 w-5 text-accent" />}
        title={t("emailConfig")}
        description={t("emailConfigDescription")}
      >
        <Alert variant="info">{t("emailComingSoon")}</Alert>
      </SettingsSection>
    </div>
  );
}
