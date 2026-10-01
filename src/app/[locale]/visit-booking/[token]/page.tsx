import { BookVisit } from "@/components/visits/book-visit";

export default async function VisitBookingPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  return <BookVisit token={token} locale={locale} />;
}
