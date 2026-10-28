import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Tinted panel, body in the normal text colour; the status colour lives in
// the icon and title so long messages stay readable.
const alertVariants = cva(
  "flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm text-foreground",
  {
    variants: {
      variant: {
        info: "bg-info-tint border-info/30",
        success: "bg-success-tint border-success/30",
        warning: "bg-warning-tint border-warning/30",
        destructive: "bg-destructive-tint border-destructive/30",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const alertAccent = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive-text",
} as const;

const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  destructive: AlertCircle,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Optional bold heading rendered above the body text */
  title?: string;
  /** Hide the leading status icon */
  hideIcon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "info", title, hideIcon = false, children, ...props }, ref) => {
    const Icon = alertIcons[variant ?? "info"];
    const accent = alertAccent[variant ?? "info"];
    return (
      <div
        ref={ref}
        role={variant === "destructive" || variant === "warning" ? "alert" : "status"}
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {!hideIcon && <Icon aria-hidden="true" className={cn("h-[18px] w-[18px] mt-px shrink-0", accent)} />}
        <div className="min-w-0 flex-1">
          {title && <p className={cn("font-bold mb-0.5", accent)}>{title}</p>}
          <div className="[&_a]:underline [&_a]:underline-offset-2">{children}</div>
        </div>
      </div>
    );
  }
);
Alert.displayName = "Alert";

export { Alert, alertVariants };
