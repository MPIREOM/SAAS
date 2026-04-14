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

const toneClasses: Record<
  Tone,
  { ring: string; iconBg: string; iconText: string; valueText: string }
> = {
  default: {
    ring: "hover:border-accent/40",
    iconBg: "bg-surface-elevated",
    iconText: "text-text-secondary",
    valueText: "text-text-primary",
  },
  accent: {
    ring: "hover:border-accent/40",
    iconBg: "bg-accent/12",
    iconText: "text-accent",
    valueText: "text-text-primary",
  },
  success: {
    ring: "hover:border-success/40",
    iconBg: "bg-success/12",
    iconText: "text-success",
    valueText: "text-success",
  },
  warning: {
    ring: "hover:border-warning/40",
    iconBg: "bg-warning/12",
    iconText: "text-warning",
    valueText: "text-warning",
  },
  destructive: {
    ring: "hover:border-destructive/40",
    iconBg: "bg-destructive/12",
    iconText: "text-destructive",
    valueText: "text-destructive",
  },
  info: {
    ring: "hover:border-info/40",
    iconBg: "bg-info/12",
    iconText: "text-info",
    valueText: "text-info",
  },
};

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
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
          {label}
        </span>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110",
            cls.iconBg
          )}
        >
          <Icon aria-hidden="true" className={cn("h-4 w-4", cls.iconText)} />
        </div>
      </div>
      <p
        className={cn(
          "mt-3 text-3xl font-display font-bold ltr-nums tabular-nums",
          cls.valueText
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-xs text-text-secondary">{hint}</p>
      )}
    </>
  );
  const baseClasses = cn(
    "group relative block overflow-hidden rounded-xl border border-border/60 bg-surface p-5 transition-all duration-300",
    cls.ring,
    href && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
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

export function StatTileSecondary({
  label,
  value,
  icon: Icon,
  tone = "default",
  href,
}: SecondaryProps) {
  const cls = toneClasses[tone];
  const inner = (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          cls.iconBg
        )}
      >
        <Icon aria-hidden="true" className={cn("h-4 w-4", cls.iconText)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary truncate">
          {label}
        </p>
        <p className="mt-0.5 text-lg font-display font-bold text-text-primary ltr-nums tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
  const baseClasses = cn(
    "group block rounded-xl border border-border/60 bg-surface p-3.5 transition-all duration-200",
    cls.ring,
    href && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
  );
  return href ? (
    <Link href={href} className={baseClasses}>
      {inner}
    </Link>
  ) : (
    <div className={baseClasses}>{inner}</div>
  );
}
