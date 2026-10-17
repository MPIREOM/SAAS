import { SignAgreement } from "@/components/agreements/sign-agreement";

export default async function TenantAgreementPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  return <SignAgreement token={token} locale={locale} />;
}
