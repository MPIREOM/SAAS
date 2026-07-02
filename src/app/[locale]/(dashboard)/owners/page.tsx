import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Wallet } from "lucide-react";

export default async function OwnersIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("owners");
  const supabase = await createClient();

  const { data: owners } = await supabase
    .from("owners")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);

  // Single-owner case (the common one): jump straight to the detail page.
  // When multiple owners exist later, this will need a real list view —
  // for now redirecting on the first row is the simplest acceptable UX.
  if (owners && owners.length > 0) {
    redirect(`/${locale}/owners/${owners[0].id}`);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="animate-fade-in-up flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-dashed border-border/40 px-6 py-16 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-elevated text-accent"
          aria-hidden="true"
        >
          <Wallet className="h-6 w-6" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-xl font-semibold tracking-tight text-text-primary">
            {t("noOwnersConfigured")}
          </h1>
          <p className="max-w-md text-sm text-text-secondary">
            Run the owner setup SQL (or create a row in the{" "}
            <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-xs text-text-primary">
              owners
            </code>{" "}
            table) and assign your properties to that owner. The ledger view
            appears once an active owner exists.
          </p>
        </div>
      </div>
    </div>
  );
}
