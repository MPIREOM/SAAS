"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";

type BadgeTone = "success" | "destructive" | "warning" | "default";

export interface ReminderLogBadge {
  label: string;
  variant: BadgeTone;
}

export interface ReminderLogRow {
  id: string;
  sentAt: string;
  tenantName: string;
  location: string | null;
  typeLabel: string;
  channel: ReminderLogBadge | null;
  status: ReminderLogBadge | null;
  delivery: ReminderLogBadge | null;
  message: string;
}

const EXCERPT_LENGTH = 60;

function excerpt(text: string): string {
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}...` : text;
}

const COLUMN_COUNT = 8;

export function ReminderLog({ rows }: { rows: ReminderLogRow[] }) {
  const t = useTranslations("reminders");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">{t("date")}</TableHead>
              <TableHead className="px-4">{t("tenant")}</TableHead>
              <TableHead className="px-4">{t("type")}</TableHead>
              <TableHead className="px-4">{t("channel")}</TableHead>
              <TableHead className="px-4">{t("status")}</TableHead>
              <TableHead className="px-4">{t("delivery")}</TableHead>
              <TableHead className="px-4">{t("message")}</TableHead>
              <TableHead className="w-12 px-2">
                <span className="sr-only">{t("showFullMessage")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const hasMessage = row.message.length > 0;
              const isOpen = hasMessage && expanded.has(row.id);
              const panelId = `reminder-message-${row.id}`;

              return (
                <Fragment key={row.id}>
                  <TableRow
                    className={cn(
                      hasMessage && "cursor-pointer",
                      isOpen && "border-b-0 bg-surface-elevated"
                    )}
                    onClick={hasMessage ? () => toggle(row.id) : undefined}
                  >
                    <TableCell className="px-4 whitespace-nowrap tabular-nums text-text-secondary ltr-nums">
                      {row.sentAt}
                    </TableCell>
                    <TableCell className="px-4">
                      <span className="block font-medium text-text-primary">
                        {row.tenantName}
                      </span>
                      {row.location && (
                        <span className="block text-xs text-text-secondary">{row.location}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 text-text-secondary">{row.typeLabel}</TableCell>
                    <TableCell className="px-4">
                      <LogBadge badge={row.channel} />
                    </TableCell>
                    <TableCell className="px-4">
                      <LogBadge badge={row.status} />
                    </TableCell>
                    <TableCell className="px-4">
                      <LogBadge badge={row.delivery} />
                    </TableCell>
                    <TableCell className="px-4">
                      <span dir="auto" className="block max-w-[250px] truncate text-text-secondary">
                        {hasMessage ? excerpt(row.message) : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="px-2">
                      {hasMessage && (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          aria-label={t(isOpen ? "hideFullMessage" : "showFullMessage")}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(row.id);
                          }}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={cn("h-4 w-4 transition-transform duration-150", isOpen && "rotate-180")}
                          />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow id={panelId} className="h-auto bg-surface-elevated">
                      <TableCell colSpan={COLUMN_COUNT} className="px-4 pt-0 pb-4">
                        <p className="mb-1.5 text-xs font-semibold text-text-secondary">
                          {t("fullMessage")}
                        </p>
                        <p
                          dir="auto"
                          className="max-w-[75ch] whitespace-pre-wrap break-words text-sm text-text-primary"
                        >
                          {row.message}
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <ul className="md:hidden divide-y divide-border">
        {rows.map((row) => {
          const hasMessage = row.message.length > 0;
          const isOpen = hasMessage && expanded.has(row.id);
          const panelId = `reminder-message-m-${row.id}`;

          return (
            <li key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{row.tenantName}</p>
                  {row.location && (
                    <p className="truncate text-xs text-text-secondary">{row.location}</p>
                  )}
                  <p className="mt-0.5 text-xs text-text-secondary">{row.typeLabel}</p>
                </div>
                <span className="shrink-0 tabular-nums text-xs text-text-secondary ltr-nums">
                  {row.sentAt}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {row.channel && <Badge variant={row.channel.variant}>{row.channel.label}</Badge>}
                {row.status && <Badge variant={row.status.variant}>{row.status.label}</Badge>}
                {row.delivery && <Badge variant={row.delivery.variant}>{row.delivery.label}</Badge>}
              </div>
              {hasMessage && (
                <>
                  <p
                    id={panelId}
                    dir="auto"
                    className={cn(
                      "mt-2 text-xs text-text-secondary",
                      isOpen ? "whitespace-pre-wrap break-words text-text-primary" : "truncate"
                    )}
                  >
                    {isOpen ? row.message : excerpt(row.message)}
                  </p>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(row.id)}
                    className="-ms-2 mt-1 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-xs font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {t(isOpen ? "hideFullMessage" : "showFullMessage")}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("h-3.5 w-3.5 transition-transform duration-150", isOpen && "rotate-180")}
                    />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LogBadge({ badge }: { badge: ReminderLogBadge | null }) {
  if (!badge) return <span className="text-xs text-text-secondary">—</span>;
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
