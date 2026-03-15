"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { ShareLinkDialog } from "./share-link-dialog";

interface ShareLinkButtonProps {
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  leases: { id: string; unit_id: string; is_active: boolean; units: { unit_number: string } }[];
  locale: string;
}

export function ShareLinkButton({
  tenantId,
  tenantName,
  tenantPhone,
  leases,
  locale,
}: ShareLinkButtonProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("maintenanceRequest");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
      >
        <Link2 className="h-4 w-4" />
        {t("shareLink")}
      </button>
      <ShareLinkDialog
        open={open}
        onOpenChange={setOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        tenantPhone={tenantPhone}
        leases={leases}
        locale={locale}
      />
    </>
  );
}
