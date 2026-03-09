import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

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
    <div className="min-h-screen bg-background" dir={isRtl ? "rtl" : "ltr"}>
      <Sidebar locale={locale} />
      <div
        className={`transition-all duration-200 ${
          isRtl ? "md:mr-60" : "md:ml-60"
        }`}
      >
        <Topbar
          locale={locale}
          userEmail={user.email}
          userName={profile?.full_name}
        />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
