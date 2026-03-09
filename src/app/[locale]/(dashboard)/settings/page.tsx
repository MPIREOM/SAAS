import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import {
  Settings,
  User,
  Bell,
  Users,
  MessageSquare,
  Mail,
  Shield,
} from "lucide-react";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings");
  const tc = await getTranslations("common");
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
        <h1 className="text-2xl font-semibold text-text-primary">
          Settings
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage your account, preferences, and system configuration
        </p>
      </div>

      {/* Profile Section */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <User className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary">
              Profile
            </h2>
            <p className="text-xs text-text-secondary">
              Your account information and preferences
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-text-secondary uppercase tracking-wider">
              Name
            </span>
            <p className="text-sm text-text-primary mt-1">
              {(profile?.full_name as string) || user?.email || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-secondary uppercase tracking-wider">
              Email
            </span>
            <p className="text-sm text-text-primary mt-1 font-mono">
              {user?.email || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-secondary uppercase tracking-wider">
              Role
            </span>
            <p className="text-sm text-text-primary mt-1 capitalize">
              {(profile?.role as string) || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-secondary uppercase tracking-wider">
              Member Since
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
            <h2 className="text-base font-medium text-text-primary">
              Notification Preferences
            </h2>
            <p className="text-xs text-text-secondary">
              Configure how and when you receive notifications
            </p>
          </div>
        </div>
        <div className="bg-surface-elevated border border-border rounded-md p-4">
          <p className="text-sm text-text-secondary">
            Notification preferences configuration coming soon. You will be able
            to customize rent reminders, lease expiry alerts, and maintenance
            updates.
          </p>
        </div>
      </div>

      {/* User Management */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-accent/10 rounded-md">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary">
              User Management
            </h2>
            <p className="text-xs text-text-secondary">
              Manage team members and their access levels
            </p>
          </div>
        </div>

        {allUsers && allUsers.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                    Name
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                    Email
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                    Role
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                    Status
                  </th>
                  <th className="text-start text-xs font-medium text-text-secondary uppercase tracking-wider px-4 py-2.5">
                    Properties
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
                          {u.is_active ? "Active" : "Inactive"}
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
                            : "All"}
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
            <p className="text-sm text-text-secondary">No users found.</p>
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
            <h2 className="text-base font-medium text-text-primary">
              WhatsApp Configuration
            </h2>
            <p className="text-xs text-text-secondary">
              Configure WhatsApp Business API for tenant notifications
            </p>
          </div>
        </div>
        <div className="bg-surface-elevated border border-border rounded-md p-4">
          <p className="text-sm text-text-secondary">
            WhatsApp integration configuration coming soon. Connect your
            WhatsApp Business account to send automated rent reminders and
            notifications.
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
            <h2 className="text-base font-medium text-text-primary">
              Email Configuration
            </h2>
            <p className="text-xs text-text-secondary">
              Set up email sending for notifications and reports
            </p>
          </div>
        </div>
        <div className="bg-surface-elevated border border-border rounded-md p-4">
          <p className="text-sm text-text-secondary">
            Email configuration coming soon. Configure SMTP settings or connect
            an email service provider for automated notifications.
          </p>
        </div>
      </div>
    </div>
  );
}
