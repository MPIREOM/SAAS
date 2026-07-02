import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Diameter utility class, e.g. "h-5 w-5". Defaults to h-6 w-6. */
  sizeClassName?: string;
  /** Accessible label announced to screen readers */
  label?: string;
}

/**
 * Standalone loading indicator for async views (dialogs, panels, pages).
 * For a spinner inside a button, use `<Button loading>` instead.
 */
const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, sizeClassName = "h-6 w-6", label, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn("flex items-center justify-center", className)}
        {...props}
      >
        <div
          aria-hidden="true"
          className={cn(
            "border-2 border-accent border-t-transparent rounded-full animate-spin",
            sizeClassName
          )}
        />
        {label && <span className="sr-only">{label}</span>}
      </div>
    );
  }
);
Spinner.displayName = "Spinner";

export { Spinner };
