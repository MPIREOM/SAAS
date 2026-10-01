"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarPlus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateSlots, validateWindow, visitDates } from "@/lib/visits/slots";

const SLOT_LENGTHS = [5, 10, 15, 20, 30, 45, 60];
const WINDOW_ERRORS = ["range", "time", "tooManyDays", "tooManySlots"];

interface Props {
  propertyId: string;
  locale: string;
  occupiedUnits: number;
  today: string;
}

export function VisitCampaignForm({ propertyId, locale, occupiedUnits, today }: Props) {
  const t = useTranslations("visits");
  const tc = useTranslations("common");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dayStart, setDayStart] = useState("09:00");
  const [dayEnd, setDayEnd] = useState("13:00");
  const [slotMinutes, setSlotMinutes] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const visitWindow = { start_date: startDate, end_date: endDate, day_start: dayStart, day_end: dayEnd, slot_minutes: slotMinutes };
  const complete = Boolean(startDate && endDate && dayStart && dayEnd);
  const windowError = complete ? validateWindow(visitWindow) : null;
  const preview =
    complete && !windowError
      ? { total: generateSlots(visitWindow).length, days: visitDates(visitWindow).length }
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (windowError) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/visits/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          title,
          notes: notes || null,
          start_date: startDate,
          end_date: endDate,
          day_start: dayStart,
          day_end: dayEnd,
          slot_minutes: slotMinutes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.id) {
        router.push(`/${locale}/properties/${propertyId}/visits/${body.id}`);
        return;
      }
      setError(t(`errors.${WINDOW_ERRORS.includes(body.error) ? body.error : "generic"}`));
    } catch {
      setError(t("errors.generic"));
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="bg-surface border border-border/60 rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-text-primary font-display">{t("form.whatSection")}</h2>
        <Input
          label={`${t("form.title")} *`}
          placeholder={t("form.titlePlaceholder")}
          helperText={t("form.titleHelp")}
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label={t("form.notes")}
          placeholder={t("form.notesPlaceholder")}
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="resize-none"
        />
      </section>

      <section className="bg-surface border border-border/60 rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-text-primary font-display">{t("form.whenSection")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="date"
            label={`${t("form.startDate")} *`}
            required
            min={today}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
            className="font-mono ltr-nums"
          />
          <Input
            type="date"
            label={`${t("form.endDate")} *`}
            required
            min={startDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="font-mono ltr-nums"
          />
          <Input
            type="time"
            label={`${t("form.dayStart")} *`}
            required
            value={dayStart}
            onChange={(e) => setDayStart(e.target.value)}
            className="font-mono ltr-nums"
          />
          <Input
            type="time"
            label={`${t("form.dayEnd")} *`}
            required
            value={dayEnd}
            onChange={(e) => setDayEnd(e.target.value)}
            className="font-mono ltr-nums"
          />
        </div>
        <Select
          label={t("form.slotLength")}
          value={String(slotMinutes)}
          onChange={(e) => setSlotMinutes(Number(e.target.value))}
          helperText={t("form.slotLengthHelp")}
        >
          {SLOT_LENGTHS.map((m) => (
            <option key={m} value={m}>
              {t("minutesShort", { minutes: m })}
            </option>
          ))}
        </Select>

        {windowError ? (
          <Alert variant="warning">{t(`errors.${windowError}`)}</Alert>
        ) : preview ? (
          <Alert variant={preview.total < occupiedUnits ? "warning" : "info"}>
            {t("form.preview", { slots: preview.total, days: preview.days, units: occupiedUnits })}
            {preview.total < occupiedUnits && ` ${t("form.notEnoughSlots")}`}
          </Alert>
        ) : null}
      </section>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={submitting}>
          {tc("cancel")}
        </Button>
        <Button type="submit" loading={submitting} disabled={Boolean(windowError)}>
          <CalendarPlus aria-hidden="true" className="h-4 w-4" />
          {t("form.create")}
        </Button>
      </div>
    </form>
  );
}
