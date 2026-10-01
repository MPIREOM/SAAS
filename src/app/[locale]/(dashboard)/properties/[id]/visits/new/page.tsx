import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { PageHeader } from "@/components/ui/page-header";
import { getPropertyUnits } from "@/lib/visits/service";
import { muscatDate } from "@/lib/visits/slots";
import { VisitCampaignForm } from "@/components/visits/visit-campaign-form";

export default async function NewVisitPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("visits");
  const tp = await getTranslations("properties");
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", id)
    .eq("is_archived", false)
    .single();
  if (!property) notFound();
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null && !propertyIds.includes(id)) notFound();

  const units = await getPropertyUnits(supabase, id);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={t("newVisit")}
        breadcrumbs={[
          { label: tp("title"), href: `/${locale}/properties` },
          { label: property.name, href: `/${locale}/properties/${id}` },
          { label: t("title"), href: `/${locale}/properties/${id}/visits` },
          { label: t("newVisit") },
        ]}
      />
      <VisitCampaignForm
        propertyId={id}
        locale={locale}
        occupiedUnits={units.filter((u) => u.tenant).length}
        today={muscatDate(new Date())}
      />
    </div>
  );
}
