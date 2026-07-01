import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Label displayed above the select */
  label?: string;
  /** Error message displayed below the select */
  error?: string;
  /** Helper text displayed below the select (hidden when error is present) */
  helperText?: string;
  /** Placeholder option text */
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, placeholder, id, children, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-foreground tracking-tight"
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          aria-invalid={!!error || undefined}
          aria-describedby={
            error
              ? `${selectId}-error`
              : helperText
                ? `${selectId}-helper`
                : undefined
          }
          className={cn(
            "flex h-10 w-full appearance-none rounded-lg border bg-surface-elevated/50 px-3 py-2 pe-8",
            "text-sm text-foreground",
            "transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:border-accent/50 focus-visible:bg-surface-elevated",
            "disabled:cursor-not-allowed disabled:opacity-40",
            "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238A8697%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_0.5rem_center] bg-no-repeat",
            error
              ? "border-destructive/60 focus-visible:ring-destructive/30 focus-visible:border-destructive"
              : "border-border/60",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        {error && (
          <p id={`${selectId}-error`} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${selectId}-helper`} className="text-xs text-text-secondary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
