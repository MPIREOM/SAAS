import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

// Public page: Meta requires a reachable privacy policy URL before the
// WhatsApp app can go live. Listed as public in src/lib/supabase/middleware.ts.

const SECTIONS = [
  "collect",
  "use",
  "whatsapp",
  "sharing",
  "retention",
  "rights",
  "deletion",
  "security",
  "changes",
] as const;

const CONTACT_EMAIL = "aaalnabhani7@gmail.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return { title: `${t("title")} · MPIRE` };
}

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <main className="mx-auto w-full max-w-3xl space-y-10">
        <header className="space-y-3 border-b border-border pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.06em] rtl:normal-case rtl:tracking-normal text-accent">MPIRE Property Management</p>
          <h1 className="text-3xl font-bold text-text-primary font-display">{t("title")}</h1>
          <p className="text-sm text-text-secondary ltr-nums">{t("lastUpdated")}</p>
          <p className="text-base leading-relaxed text-text-secondary">{t("intro")}</p>
        </header>

        {SECTIONS.map((key) => (
          <section key={key} id={key} className="space-y-2 scroll-mt-8">
            <h2 className="text-lg font-semibold text-text-primary font-display">{t(`sections.${key}.title`)}</h2>
            <p className="text-sm leading-relaxed text-text-secondary">{t(`sections.${key}.body`)}</p>
          </section>
        ))}

        <section id="contact" className="space-y-2 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary font-display">{t("sections.contact.title")}</h2>
          <p className="text-sm text-text-secondary">{t("sections.contact.body")}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-block rounded tabular-nums text-sm text-accent ltr-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {CONTACT_EMAIL}
          </a>
        </section>
      </main>
    </div>
  );
}
