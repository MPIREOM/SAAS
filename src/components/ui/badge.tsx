import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

// Pill with a leading dot: status always pairs colour with a word, and
// the dot keeps it scannable when colour alone can't be told apart.
const badgeVariants = cva(
  [
    "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold",
    "before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
    // A badge that brings its own icon drops the dot.
    "has-[svg]:before:hidden",
  ],
  {
    variants: {
      variant: {
        default: "bg-accent-tint text-accent-tint-foreground",
        secondary: "bg-neutral-tint text-text-secondary",
        warning: "bg-warning-tint text-warning",
        destructive: "bg-destructive-tint text-destructive-text",
        success: "bg-success-tint text-success",
        info: "bg-info-tint text-info",
        outline: "border border-border-strong bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
