import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label displayed above the textarea */
  label?: string;
  /** Error message displayed below the textarea */
  error?: string;
  /** Helper text displayed below the textarea (hidden when error is present) */
  helperText?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const textareaId = id || React.useId();

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          aria-invalid={!!error || undefined}
          aria-describedby={
            error
              ? `${textareaId}-error`
              : helperText
                ? `${textareaId}-helper`
                : undefined
          }
          className={cn(
            "flex min-h-[80px] w-full rounded-lg border bg-surface px-3 py-2",
            "text-sm text-foreground placeholder:text-muted-foreground",
            "transition-colors duration-150 resize-y",
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
          <p id={`${textareaId}-error`} className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${textareaId}-helper`} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
