import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label displayed above the input */
  label?: string;
  /** Error message displayed below the input */
  error?: string;
  /** Helper text displayed below the input (hidden when error is present) */
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", label, error, helperText, id, ...props }, ref) => {
    const inputId = id || React.useId();

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          ref={ref}
          aria-invalid={!!error || undefined}
          aria-describedby={
            error
              ? `${inputId}-error`
              : helperText
                ? `${inputId}-helper`
                : undefined
          }
          className={cn(
            "flex h-10 w-full rounded-lg border bg-surface px-3 py-2",
            "text-sm text-foreground placeholder:text-muted-foreground",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:border-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-red-500 focus-visible:ring-red-500/50 focus-visible:border-red-500"
              : "border-border",
            className
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${inputId}-helper`} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
