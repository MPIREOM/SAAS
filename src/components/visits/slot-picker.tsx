"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { formatSlotTime, formatVisitDay, muscatDate } from "@/lib/visits/slots";

export interface SlotOption {
  start: string;
  available: boolean;
}

interface Props {
  slots: SlotOption[];
  value: string | null;
  onChange: (start: string) => void;
  locale: string;
  /** A slot to highlight as the tenant's current one (manage page). */
  currentSlot?: string | null;
}

/** Day chips + a grid of time chips; one apartment per slot. */
export function SlotPicker({ slots, value, onChange, locale, currentSlot }: Props) {
  const t = useTranslations("visitBooking");

  const days = useMemo(() => {
    const byDay = new Map<string, SlotOption[]>();
    for (const slot of slots) {
      const day = muscatDate(slot.start);
      const list = byDay.get(day) ?? [];
      list.push(slot);
      byDay.set(day, list);
    }
    return Array.from(byDay, ([day, list]) => ({
      day,
      slots: list,
      free: list.filter((s) => s.available).length,
    }));
  }, [slots]);

  const firstOpenDay = days.find((d) => d.free > 0)?.day ?? days[0]?.day ?? null;
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const valueDay = value ? muscatDate(value) : null;
  const activeDay = pickedDay ?? valueDay ?? firstOpenDay;
  const current = days.find((d) => d.day === activeDay);

  if (days.length === 0 || days.every((d) => d.free === 0)) {
    return <p className="text-sm text-text-secondary">{t("noSlotsLeft")}</p>;
  }

  return (
    <div className="space-y-4">
      {days.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("chooseDay")}>
          {days.map((d) => (
            <button
              key={d.day}
              type="button"
              aria-pressed={d.day === activeDay}
              disabled={d.free === 0}
              onClick={() => setPickedDay(d.day)}
              className={cn(
                "flex flex-col items-start rounded-lg border px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                d.day === activeDay
                  ? "border-accent bg-accent/10"
                  : "border-border/60 bg-surface-elevated/50 hover:border-accent/40",
                "disabled:cursor-not-allowed disabled:opacity-40"
              )}
            >
              <span className="text-sm font-medium text-text-primary">
                {formatVisitDay(d.day, locale)}
              </span>
              <span className="text-[11px] text-text-secondary">
                {t("freeSlots", { count: d.free })}
              </span>
            </button>
          ))}
        </div>
      )}

      {current && (
        <p id="slot-day-heading" className="text-sm font-semibold text-text-primary">
          {t("dayHeading", { day: formatVisitDay(current.day, locale, "long") })}
        </p>
      )}

      {current && (
        <div
          className="grid grid-cols-3 sm:grid-cols-5 gap-2"
          role="radiogroup"
          aria-labelledby="slot-day-heading"
        >
          {current.slots.map((slot) => {
            const selected = slot.start === value;
            const isCurrent = slot.start === currentSlot;
            return (
              <button
                key={slot.start}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!slot.available}
                onClick={() => onChange(slot.start)}
                className={cn(
                  "h-11 rounded-lg border font-mono text-sm ltr-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border/60 bg-surface-elevated/50 text-text-primary hover:border-accent/40",
                  isCurrent && !selected && "border-accent/60",
                  "disabled:cursor-not-allowed disabled:bg-transparent disabled:text-text-secondary/40 disabled:line-through"
                )}
              >
                {formatSlotTime(slot.start, locale)}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-text-secondary">{t("slotHint")}</p>
    </div>
  );
}
