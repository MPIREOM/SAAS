"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, FileSpreadsheet } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { ImportTenantsDialog } from "./import-dialog";

export function TenantsHeader({ locale }: { locale: string }) {
  const t = useTranslations("tenants");
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          {t("importExcel")}
        </Button>
        <Link href={`/${locale}/tenants/new`} className={cn(buttonVariants())}>
          <Plus className="h-4 w-4" aria-hidden="true" />
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
