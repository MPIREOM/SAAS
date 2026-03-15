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
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/40 px-6 py-16 text-center",
          className
        )}
        {...props}
      >
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-elevated text-text-secondary">
            {icon}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground font-display">{title}</h3>
          {description && (
            <p className="max-w-sm text-sm text-text-secondary">
              {description}
            </p>
          )}
        </div>
        {action && <div className="pt-2">{action}</div>}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
