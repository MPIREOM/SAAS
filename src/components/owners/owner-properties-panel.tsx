"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/toast";
import { CURRENCY } from "@/lib/currency";
import type { OwnerDetailProps, PropertyRow, UnitRow } from "@/components/owners/types";

const COMMISSION_OPTIONS = [
  { value: "percentage", label: "Percentage of rent" },
  { value: "included_in_business_fee", label: "Included in business fee" },
  { value: "none", label: "No commission" },
] as const;

export function OwnerPropertiesPanel({ properties, units }: OwnerDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const unitsByProperty = useMemo(() => {
    const m = new Map<string, UnitRow[]>();
    for (const u of units) {
      const list = m.get(u.property_id) || [];
      list.push(u);
      m.set(u.property_id, list);
    }
    return m;
  }, [units]);

  async function saveProperty(p: PropertyRow, type: PropertyRow["commission_type"], rate: number) {
    setSavingId(p.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("properties")
      .update({ commission_type: type, commission_rate: rate })
      .eq("id", p.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    await logAudit(supabase, {
      action: "update",
      entity_type: "property",
      entity_id: p.id,
      metadata: { commission_type: type, commission_rate: rate },
    });
    toast({ title: "Commission updated", variant: "success" });
    router.refresh();
  }

  async function saveUnit(
    u: UnitRow,
    type: UnitRow["commission_type"],
    rate: number | null,
  ) {
    setSavingId(u.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("units")
      .update({
        commission_type: type,
        commission_rate: rate,
      })
      .eq("id", u.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    await logAudit(supabase, {
      action: "update",
      entity_type: "unit",
      entity_id: u.id,
      metadata: {
        commission_type: type,
        commission_rate: rate,
      },
    });
    toast({ title: "Unit override saved", variant: "success" });
    router.refresh();
  }

  if (properties.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-surface-elevated/30 p-6 text-sm text-text-secondary">
        No properties linked to this owner yet. Use the SQL seed in
        <code className="mx-1">supabase/seed/owner_setup.sql</code>
        to assign properties.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        Set the commission arrangement for each property. Use a per-unit
        override only when units inside the same property have different
        arrangements.
      </p>

      {properties.map((p) => {
        const propUnits = unitsByProperty.get(p.id) || [];
        const hasOverrides = propUnits.some((u) => u.commission_type);
        const isExpanded = expanded === p.id;
        return (
          <div
            key={p.id}
            className="rounded-2xl border border-border/60 bg-surface-elevated/30 overflow-hidden"
          >
            <PropertyRowEditor
              property={p}
              saving={savingId === p.id}
              onSave={saveProperty}
              onToggleUnits={() => setExpanded(isExpanded ? null : p.id)}
              isExpanded={isExpanded}
              hasOverrides={hasOverrides}
              unitCount={propUnits.length}
            />

            {isExpanded && (
              <div className="border-t border-border/40 bg-surface/40">
                <div className="px-4 py-3 text-[10px] uppercase tracking-wider text-text-secondary font-medium">
                  Per-unit overrides
                </div>
                <div className="divide-y divide-border/40">
                  {propUnits.map((u) => (
                    <UnitRowEditor
                      key={u.id}
                      unit={u}
                      saving={savingId === u.id}
                      onSave={saveUnit}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PropertyRowEditor({
  property,
  saving,
  onSave,
  onToggleUnits,
  isExpanded,
  hasOverrides,
  unitCount,
}: {
  property: PropertyRow;
  saving: boolean;
  onSave: (
    p: PropertyRow,
    type: PropertyRow["commission_type"],
    rate: number,
  ) => void;
  onToggleUnits: () => void;
  isExpanded: boolean;
  hasOverrides: boolean;
  unitCount: number;
}) {
  const [type, setType] = useState<PropertyRow["commission_type"]>(
    property.commission_type,
  );
  const [rate, setRate] = useState(String(Number(property.commission_rate || 0)));
  const dirty = type !== property.commission_type || Number(rate) !== Number(property.commission_rate);

  return (
    <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
      <button
        onClick={onToggleUnits}
        className="text-text-secondary hover:text-text-primary"
        title="Show units / per-unit overrides"
      >
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-primary truncate">{property.name}</div>
        <div className="text-xs text-text-secondary truncate">
          {unitCount} {unitCount === 1 ? "unit" : "units"}
          {hasOverrides && (
            <span className="ms-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              has unit overrides
            </span>
          )}
        </div>
      </div>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PropertyRow["commission_type"])}
        className="h-9 bg-surface-elevated border border-border/60 rounded-lg px-2 text-xs"
      >
        {COMMISSION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {type === "percentage" && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="h-9 w-20 bg-surface-elevated border border-border/60 rounded-lg px-2 text-xs font-mono text-end"
          />
          <span className="text-xs text-text-secondary">%</span>
        </div>
      )}
      <button
        onClick={() => onSave(property, type, Number(rate))}
        disabled={!dirty || saving}
        className="h-9 px-3 text-xs font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function UnitRowEditor({
  unit,
  saving,
  onSave,
}: {
  unit: UnitRow;
  saving: boolean;
  onSave: (
    u: UnitRow,
    type: UnitRow["commission_type"],
    rate: number | null,
  ) => void;
}) {
  // null type means "inherit property". We surface this as the empty option.
  const [type, setType] = useState<UnitRow["commission_type"]>(unit.commission_type);
  const [rate, setRate] = useState(
    unit.commission_rate !== null ? String(Number(unit.commission_rate)) : "",
  );
  const dirty =
    type !== unit.commission_type ||
    (type === "percentage" &&
      Number(rate) !== Number(unit.commission_rate || 0));

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
      <Pencil className="h-3.5 w-3.5 text-text-secondary opacity-50" />
      <div className="min-w-0 flex-1 text-xs">
        <span className="font-medium font-mono">Unit {unit.unit_number}</span>
        <span className="text-text-secondary ms-2">
          {Number(unit.rent_amount).toLocaleString("en-OM", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          {CURRENCY.code}/mo · {unit.status}
        </span>
      </div>
      <select
        value={type ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          setType((v ? v : null) as UnitRow["commission_type"]);
        }}
        className="h-9 bg-surface-elevated border border-border/60 rounded-lg px-2 text-xs"
      >
        <option value="">Inherit from property</option>
        {COMMISSION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {type === "percentage" && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="h-9 w-20 bg-surface-elevated border border-border/60 rounded-lg px-2 text-xs font-mono text-end"
          />
          <span className="text-xs text-text-secondary">%</span>
        </div>
      )}
      <button
        onClick={() =>
          onSave(unit, type, type === "percentage" ? Number(rate) : null)
        }
        disabled={!dirty || saving}
        className="h-9 px-3 text-xs font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
