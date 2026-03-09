import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-accent/15 text-accent border border-accent/20",
        secondary: "bg-muted/50 text-muted-foreground border border-border",
        warning: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
        destructive: "bg-red-500/15 text-red-400 border border-red-500/20",
        success: "bg-green-500/15 text-green-400 border border-green-500/20",
        outline: "bg-transparent text-foreground border border-border",
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
