import { getAuthContext } from "@/lib/access-control";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { AssistantWidget } from "@/components/assistant/assistant-widget";

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
    <div className="min-h-screen bg-background" dir={isRtl ? "rtl" : "ltr"}>
      <Sidebar locale={locale} />
      <div className="min-w-0 transition-[margin] duration-200 ease-out md:ms-[var(--sidebar-w,232px)]">
        <Topbar
          locale={locale}
          userEmail={context.email ?? undefined}
          userName={context.fullName ?? undefined}
        />
        <main className="mx-auto w-full max-w-[1440px] px-3 pt-4 pb-24 sm:px-4 md:p-6">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
      {context.role === "super_admin" && <AssistantWidget locale={locale} />}
    </div>
  );
}
