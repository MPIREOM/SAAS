import * as React from "react";
import { AlertCircle } from "lucide-react";
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
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-[13px] font-semibold text-foreground"
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
            "flex min-h-28 w-full rounded-lg border bg-surface px-3 py-2.5 leading-relaxed",
            "text-sm text-foreground placeholder:text-text-tertiary",
            "transition-colors duration-150 resize-y",
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
          <p id={`${textareaId}-error`} className="flex items-center gap-1.5 text-[12.5px] font-medium text-destructive-text" role="alert">
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${textareaId}-helper`} className="text-[12.5px] text-text-secondary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
