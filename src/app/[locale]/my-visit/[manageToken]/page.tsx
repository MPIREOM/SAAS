import { ManageVisit } from "@/components/visits/manage-visit";

export default async function MyVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; manageToken: string }>;
  searchParams: Promise<{ booked?: string; existing?: string }>;
}) {
  const { locale, manageToken } = await params;
  const { booked, existing } = await searchParams;
  const notice = booked ? "booked" : existing ? "existing" : null;
  return <ManageVisit manageToken={manageToken} locale={locale} notice={notice} />;
}
