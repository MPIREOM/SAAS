"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Pencil, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/toast";
import { CURRENCY } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
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
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        title="No properties linked to this owner yet"
        description="Use the SQL seed in supabase/seed/owner_setup.sql to assign properties."
      />
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
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
            className="overflow-hidden rounded-xl border border-border/60 bg-surface-elevated/30 transition-colors hover:border-border"
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
                <div className="px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
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
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggleUnits}
        title="Show units / per-unit overrides"
        aria-label="Show units / per-unit overrides"
        aria-expanded={isExpanded}
        className="h-8 w-8 p-0 text-text-secondary hover:text-text-primary"
      >
        {isExpanded ? (
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        ) : (
          <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
        )}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">{property.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span className="font-mono ltr-nums">{unitCount}</span>
          <span>{unitCount === 1 ? "unit" : "units"}</span>
          {hasOverrides && (
            <Badge variant="warning" className="text-[10px] uppercase tracking-wider">
              has unit overrides
            </Badge>
          )}
        </div>
      </div>
      <Select
        value={type}
        onChange={(e) => setType(e.target.value as PropertyRow["commission_type"])}
        aria-label="Commission arrangement"
        className="h-9 w-52 text-xs"
      >
        {COMMISSION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {type === "percentage" && (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            aria-label="Commission rate (%)"
            className="h-9 w-20 font-mono ltr-nums text-xs text-end"
          />
          <span className="text-xs text-text-secondary">%</span>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        onClick={() => onSave(property, type, Number(rate))}
        disabled={!dirty || saving}
        loading={saving}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
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
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary/50" />
      <div className="min-w-0 flex-1 text-xs">
        <span className="font-mono font-medium ltr-nums">Unit {unit.unit_number}</span>
        <span className="ms-2 text-text-secondary">
          <span className="font-mono ltr-nums">
            {Number(unit.rent_amount).toLocaleString("en-OM", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>{" "}
          {CURRENCY.code}/mo · {unit.status}
        </span>
      </div>
      <Select
        value={type ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          setType((v ? v : null) as UnitRow["commission_type"]);
        }}
        aria-label="Unit commission override"
        className="h-9 w-52 text-xs"
      >
        <option value="">Inherit from property</option>
        {COMMISSION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {type === "percentage" && (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            aria-label="Unit commission rate (%)"
            className="h-9 w-20 font-mono ltr-nums text-xs text-end"
          />
          <span className="text-xs text-text-secondary">%</span>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        onClick={() =>
          onSave(unit, type, type === "percentage" ? Number(rate) : null)
        }
        disabled={!dirty || saving}
        loading={saving}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
