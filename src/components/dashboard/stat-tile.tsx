import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Two compact tile shapes for the dashboard:
 *
 * - <StatTilePrimary>   — large hero KPI: big number, prominent icon,
 *                         optional sub-line. Used for the 4 most
 *                         important metrics at the top of the dashboard.
 * - <StatTileSecondary> — small count tile: stacked label + number,
 *                         used for the supporting metrics below.
 *
 * Both render as <Link> when href is provided, or a plain <div>
 * otherwise. Both are visually distinct so the eye knows what to
 * focus on first.
 */

type Tone =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "destructive"
  | "info";

// Tone colours the icon tile only; values stay in the text colour except
// destructive, where the number itself is the alarm.
const toneClasses: Record<Tone, { iconTile: string; valueText: string; border: string }> = {
  default: { iconTile: "bg-sunken text-text-secondary", valueText: "text-text-primary", border: "border-border" },
  accent: { iconTile: "bg-accent-tint text-accent-tint-foreground", valueText: "text-text-primary", border: "border-border" },
  success: { iconTile: "bg-success-tint text-success", valueText: "text-text-primary", border: "border-border" },
  warning: { iconTile: "bg-warning-tint text-warning", valueText: "text-text-primary", border: "border-border" },
  destructive: { iconTile: "bg-destructive-tint text-destructive-text", valueText: "text-destructive-text", border: "border-destructive/35" },
  info: { iconTile: "bg-info-tint text-info", valueText: "text-text-primary", border: "border-border" },
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Renders "1,234.500 OMR" as a number with a smaller trailing unit. */
function Value({ value, unitClassName }: { value: string | number; unitClassName: string }) {
  const text = String(value);
  const m = /^(.*\d)\s+([^\d\s]+)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <small className={unitClassName}>{m[2]}</small>
    </>
  );
}

interface PrimaryProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
}

export function StatTilePrimary({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: PrimaryProps) {
  const cls = toneClasses[tone];
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-text-secondary">{label}</span>
        <span
          aria-hidden="true"
          className={cn("ms-auto grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg", cls.iconTile)}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={cn(
          "mt-1.5 text-[22px] sm:text-[28px] leading-tight font-bold ltr-nums tabular-nums",
          cls.valueText
        )}
      >
        <Value value={value} unitClassName="ms-1 text-xs sm:text-sm font-semibold text-text-secondary" />
      </p>
      {hint && <p className="mt-1 text-[13px] text-text-secondary">{hint}</p>}
    </>
  );
  const baseClasses = cn(
    "block rounded-xl border bg-surface p-3 sm:p-4 shadow-card transition-colors duration-150",
    cls.border,
    href && cn("hover:bg-surface-elevated", focusRing)
  );
  return href ? (
    <Link href={href} className={baseClasses}>
      {inner}
    </Link>
  ) : (
    <div className={baseClasses}>{inner}</div>
  );
}

interface SecondaryProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
}

/**
 * One cell of the portfolio snapshot strip. Place cells in a grid with
 * `gap-px bg-border` so the 1px gaps draw the dividers.
 */
export function StatTileSecondary({
  label,
  value,
  icon: Icon,
  tone = "default",
  href,
}: SecondaryProps) {
  const cls = toneClasses[tone];
  const inner = (
    <>
      <span className="flex items-center gap-2 text-[12.5px] font-medium text-text-secondary">
        <Icon
          aria-hidden="true"
          className={cn("h-3.5 w-3.5 shrink-0", tone === "default" ? "text-text-tertiary" : cls.iconTile.split(" ")[1])}
        />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-lg font-bold text-text-primary ltr-nums tabular-nums">
        <Value value={value} unitClassName="ms-1 text-xs font-semibold text-text-secondary" />
      </span>
    </>
  );
  const baseClasses = cn(
    "flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5 transition-colors duration-150",
    href && cn("hover:bg-surface-elevated", focusRing, "focus-visible:outline-offset-[-2px]")
  );
  return href ? (
    <Link href={href} className={baseClasses}>
      {inner}
    </Link>
  ) : (
    <div className={baseClasses}>{inner}</div>
  );
}
