import * as React from "react";
import { AlertCircle } from "lucide-react";
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
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-semibold text-foreground"
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
            "flex h-[42px] w-full rounded-lg border bg-surface px-3 py-2",
            "text-sm text-foreground placeholder:text-text-tertiary",
            "transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:border-accent",
            "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-text-tertiary disabled:border-border",
            error
              ? "border-destructive ring-1 ring-destructive"
              : "border-border-strong",
            className
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="flex items-center gap-1.5 text-[12.5px] font-medium text-destructive-text" role="alert">
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${inputId}-helper`} className="text-[12.5px] text-text-secondary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
