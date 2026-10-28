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
                "flex min-h-12 flex-col items-start justify-center rounded-lg border px-3 py-2 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                d.day === activeDay
                  ? "border-accent bg-accent-tint ring-1 ring-inset ring-accent"
                  : "border-border-strong bg-surface hover:bg-surface-elevated",
                "disabled:cursor-not-allowed disabled:border-border disabled:bg-sunken disabled:opacity-70"
              )}
            >
              <span className="text-sm font-semibold text-text-primary">
                {formatVisitDay(d.day, locale)}
              </span>
              <span className="text-xs text-text-secondary">
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
                  "h-12 rounded-lg border tabular-nums text-sm font-semibold ltr-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border-strong bg-surface text-text-primary hover:bg-surface-elevated",
                  isCurrent && !selected && "border-accent ring-1 ring-inset ring-accent",
                  "disabled:cursor-not-allowed disabled:border-border disabled:bg-sunken disabled:text-text-tertiary disabled:font-normal disabled:line-through"
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
