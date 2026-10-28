import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon element displayed at the top */
  icon?: React.ReactNode;
  /** Primary heading text */
  title: string;
  /** Supporting description text */
  description?: string;
  /** Optional action element (e.g. a Button) rendered below the description */
  action?: React.ReactNode;
  /** Drop the card frame when the empty state already sits inside a card */
  bare?: boolean;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, bare = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
          !bare && "rounded-xl border border-border bg-surface shadow-card",
          className
        )}
        {...props}
      >
        {icon && (
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-sunken text-text-secondary" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h3 className="text-[15px] font-semibold text-foreground font-display">{title}</h3>
          {description && (
            <p className="max-w-xs text-[13.5px] text-text-secondary">
              {description}
            </p>
          )}
        </div>
        {action && <div className="pt-1">{action}</div>}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
