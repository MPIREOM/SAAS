import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login`);
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const isRtl = locale === "ar";

  return (
    <div className="min-h-screen bg-background noise-overlay" dir={isRtl ? "rtl" : "ltr"}>
      <Sidebar locale={locale} />
      <div
        className={`transition-all duration-300 ease-out ${
          isRtl ? "md:mr-64" : "md:ml-64"
        }`}
      >
        <Topbar
          locale={locale}
          userEmail={user.email}
          userName={profile?.full_name}
        />
        <main className="p-4 md:p-8"><ToastProvider>{children}</ToastProvider></main>
      </div>
    </div>
  );
}
