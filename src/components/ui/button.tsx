import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent",
    "text-sm font-semibold leading-none transition-colors duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none aria-busy:cursor-progress",
    "cursor-pointer [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-press",
        secondary:
          "bg-surface text-foreground border-border-strong hover:bg-surface-elevated hover:border-text-tertiary",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        outline:
          "bg-surface text-foreground border-border-strong hover:bg-surface-elevated hover:border-text-tertiary",
        ghost:
          "bg-transparent text-accent hover:bg-accent-tint hover:text-accent-tint-foreground",
      },
      size: {
        sm: "h-[34px] px-3 text-[13px]",
        default: "h-10 px-4",
        lg: "h-12 px-5 text-[15px]",
        icon: "h-10 w-10 p-0",
      },
      // Set by the component: disabled-but-not-loading. A loading button
      // keeps its colour so the spinner reads as progress, not as off.
      inactive: {
        true: "bg-neutral-tint text-text-tertiary border-transparent hover:bg-neutral-tint",
        false: "",
      },
    },
    compoundVariants: [
      // Icon-only ghost buttons are toolbar controls, not teal links.
      {
        variant: "ghost",
        size: "icon",
        className: "text-text-secondary hover:bg-surface-elevated hover:text-foreground",
      },
      { variant: "ghost", inactive: true, className: "bg-transparent hover:bg-transparent" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      inactive: false,
    },
  }
);

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4 animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, "inactive"> {
  /** Show a loading spinner and disable the button */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          buttonVariants({ variant, size, inactive: !!disabled && !loading }),
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
