"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wrench, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

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

  if (currentStatus === "occupied") return null; // Can't toggle occupied units

  const isMaintenance = currentStatus === "maintenance";
  const nextStatus = isMaintenance ? "vacant" : "maintenance";
  const label = isMaintenance ? "Mark as Vacant" : "Mark as Under Maintenance";
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
      toast({ title: `Unit marked as ${nextStatus}`, variant: "success" });
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-2 h-8 px-3 text-xs rounded-md border transition-colors ${
        isMaintenance
          ? "bg-success/10 border-success/20 text-success hover:bg-success/20"
          : "bg-warning/10 border-warning/20 text-warning hover:bg-warning/20"
      } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {loading ? "..." : label}
    </button>
  );
}
