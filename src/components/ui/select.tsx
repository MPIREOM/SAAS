import * as React from "react";
import { AlertCircle } from "lucide-react";
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
            className="text-[13px] font-semibold text-foreground"
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
            "flex h-[42px] w-full appearance-none rounded-lg border bg-surface ps-3 pe-9 py-2",
            "text-sm text-foreground cursor-pointer",
            // Chevron colour follows the theme via --select-chevron (globals.css)
            "bg-(image:--select-chevron) bg-no-repeat bg-[position:right_0.75rem_center] rtl:bg-[position:left_0.75rem_center]",
            "transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:border-accent",
            "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-text-tertiary disabled:border-border",
            error
              ? "border-destructive ring-1 ring-destructive"
              : "border-border-strong",
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
          <p id={`${selectId}-error`} className="flex items-center gap-1.5 text-[12.5px] font-medium text-destructive-text" role="alert">
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${selectId}-helper`} className="text-[12.5px] text-text-secondary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
