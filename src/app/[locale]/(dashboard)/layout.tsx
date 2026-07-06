import { getAuthContext } from "@/lib/access-control";
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

  // Request-cached: shared with the page being rendered, so the old
  // getUser() network call + profile query here no longer add their own
  // round-trips on top of the page's.
  const context = await getAuthContext();

  if (!context) {
    redirect(`/${locale}/auth/login`);
  }

  const isRtl = locale === "ar";

  return (
    <div className="min-h-screen bg-background noise-overlay" dir={isRtl ? "rtl" : "ltr"}>
      <Sidebar locale={locale} />
      <div className="transition-all duration-300 ease-out md:ms-64">
        <Topbar
          locale={locale}
          userEmail={context.email ?? undefined}
          userName={context.fullName ?? undefined}
        />
        <main className="p-4 md:p-8"><ToastProvider>{children}</ToastProvider></main>
      </div>
    </div>
  );
}
