"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Wrench, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function UnitStatusToggle({
  unitId,
  currentStatus,
}: {
  unitId: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("units");

  if (currentStatus === "occupied") return null; // Can't toggle occupied units

  const isMaintenance = currentStatus === "maintenance";
  const nextStatus = isMaintenance ? "vacant" : "maintenance";
  const label = isMaintenance ? t("markVacant") : t("markMaintenance");
  const Icon = isMaintenance ? CheckCircle2 : Wrench;

  async function handleToggle() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("units")
      .update({ status: nextStatus })
      .eq("id", unitId);

    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: t("statusUpdated", { status: t(nextStatus) }), variant: "success" });
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={handleToggle}
      loading={loading}
      className={cn(
        "gap-1.5",
        isMaintenance
          ? "border-success/25 bg-success/10 text-success hover:border-success/40 hover:bg-success/20"
          : "border-warning/25 bg-warning/10 text-warning hover:border-warning/40 hover:bg-warning/20"
      )}
    >
      {!loading && <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
