import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function OwnersIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <h1 className="text-2xl font-display font-semibold mb-2">
        No owners configured
      </h1>
      <p className="text-text-secondary max-w-md">
        Run the owner setup SQL (or create a row in the <code>owners</code> table)
        and assign your properties to that owner. The ledger view appears once
        an active owner exists.
      </p>
    </div>
  );
}
