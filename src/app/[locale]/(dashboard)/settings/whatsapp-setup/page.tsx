import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthContext } from "@/lib/access-control";
import { PageHeader } from "@/components/ui/page-header";
import { WhatsAppSetupPanel } from "@/components/settings/whatsapp-setup-panel";

export default async function WhatsAppSetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "super_admin") redirect(`/${locale}/settings`);
  const t = await getTranslations("settings");

  return (
    <div className="max-w-4xl space-y-6 stagger-children">
      <PageHeader title={t("whatsappSetupTitle")} description={t("whatsappSetupSubtitle")} />
      <WhatsAppSetupPanel />
    </div>
  );
}
