"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Horizontal step indicator used at the top of multi-step wizards.
 *
 * Each step has a label and a state derived from `activeIndex`:
 *  - completed (idx < activeIndex)
 *  - current   (idx === activeIndex)
 *  - upcoming  (idx > activeIndex)
 *
 * Visual encoding follows the rest of the design system:
 *  - completed: filled accent circle with check icon
 *  - current:   outlined accent circle with the step number
 *  - upcoming:  muted circle with the step number
 *
 * The labels are clickable when the step is completed (so the user can
 * jump back to fix a previous step), but never forward — onChange is
 * only invoked for completed steps, never upcoming ones, to keep the
 * wizard's per-step validation honest.
 */

export interface StepperStep {
  /** Stable key for the step (used for React keys and accessibility) */
  id: string;
  /** Visible label */
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  activeIndex: number;
  /** Called when the user clicks a previously completed step */
  onChange?: (index: number) => void;
  className?: string;
}

export function Stepper({ steps, activeIndex, onChange, className }: StepperProps) {
  const t = useTranslations("common");
  return (
    <ol
      role="list"
      aria-label={t("progress")}
      className={cn(
        "flex items-center gap-2 sm:gap-3 overflow-x-auto",
        className
      )}
    >
      {steps.map((step, idx) => {
        const isCompleted = idx < activeIndex;
        const isCurrent = idx === activeIndex;
        const canJump = isCompleted && !!onChange;

        const indicator = (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
              isCompleted &&
                "bg-accent text-accent-foreground",
              isCurrent &&
                "border-2 border-accent text-accent bg-accent/5",
              !isCompleted &&
                !isCurrent &&
                "border border-border/60 text-text-secondary bg-surface-elevated/50"
            )}
            aria-hidden="true"
          >
            {isCompleted ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              idx + 1
            )}
          </span>
        );

        const labelClasses = cn(
          "text-xs sm:text-sm font-medium whitespace-nowrap",
          isCurrent && "text-text-primary",
          isCompleted && "text-text-primary",
          !isCompleted && !isCurrent && "text-text-secondary"
        );

        return (
          <li
            key={step.id}
            className="flex items-center gap-2 sm:gap-3 shrink-0"
            aria-current={isCurrent ? "step" : undefined}
          >
            {canJump ? (
              <button
                type="button"
                onClick={() => onChange?.(idx)}
                className="flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {indicator}
                <span className={cn(labelClasses, "hover:text-accent transition-colors")}>
                  {step.label}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {indicator}
                <span className={labelClasses}>{step.label}</span>
              </div>
            )}
            {idx < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px w-4 sm:w-8 transition-colors",
                  idx < activeIndex ? "bg-accent" : "bg-border"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
