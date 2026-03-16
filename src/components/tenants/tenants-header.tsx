"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, FileSpreadsheet } from "lucide-react";
import { ImportTenantsDialog } from "./import-dialog";

export function TenantsHeader({ locale }: { locale: string }) {
  const t = useTranslations("tenants");
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4" />
          {t("importExcel")}
        </button>
        <Link
          href={`/${locale}/tenants/new`}
          className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          {t("createTenant")}
        </Link>
      </div>

      <ImportTenantsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </>
  );
}
