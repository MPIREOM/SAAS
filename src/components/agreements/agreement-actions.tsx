"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink, Send } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

// Staff buttons on the unit page's agreement card: send / resend the
// signing link, and open the signing page here so the tenant can sign in
// person (e.g. on a tablet in the office).

export function AgreementActions({
  leaseId,
  signingUrl,
  status,
}: {
  leaseId: string;
  signingUrl: string | null;
  status: "none" | "pending" | "signed";
}) {
  const t = useTranslations("tenantAgreement.staff");
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch("/api/agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: leaseId, resend: status === "pending" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast({ title: body.error || t("sendFailed"), variant: "destructive" });
      else if (body.sent) toast({ title: t("sent"), variant: "success" });
      else if (body.status === "signed") toast({ title: t("alreadySigned"), variant: "success" });
      else toast({ title: t("notDelivered", { error: body.whatsapp?.error || body.email?.error || "" }), variant: "destructive" });
      router.refresh();
    } catch {
      toast({ title: t("sendFailed"), variant: "destructive" });
    }
    setBusy(false);
  }

  if (status === "signed") return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={send} loading={busy}>
        <Send aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-180" />
        {status === "none" ? t("send") : t("resend")}
      </Button>
      {signingUrl && (
        <a
          href={signingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-8 px-3 bg-surface-elevated border border-border/60 text-text-secondary text-xs font-medium rounded-md hover:border-accent/30 hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          {t("signInPerson")}
        </a>
      )}
    </div>
  );
}
