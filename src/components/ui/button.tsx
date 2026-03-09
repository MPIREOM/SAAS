import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg",
    "text-sm font-medium transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "cursor-pointer",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 active:bg-accent/80",
        secondary:
          "bg-surface text-foreground shadow-sm border border-border hover:bg-surface-hover active:bg-surface-hover/80",
        destructive:
          "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-surface-hover active:bg-surface-hover/80",
        ghost:
          "bg-transparent text-foreground hover:bg-surface-hover active:bg-surface-hover/80",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-md",
        default: "h-10 px-4 py-2",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
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
    VariantProps<typeof buttonVariants> {
  /** Show a loading spinner and disable the button */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
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
