import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const alertVariants = cva(
  "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "bg-info/10 border-info/25 text-info",
        success: "bg-success/10 border-success/25 text-success",
        warning: "bg-warning/10 border-warning/25 text-warning",
        destructive: "bg-destructive/10 border-destructive/25 text-destructive",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

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
    return (
      <div
        ref={ref}
        role={variant === "destructive" || variant === "warning" ? "alert" : "status"}
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {!hideIcon && <Icon aria-hidden="true" className="h-4 w-4 mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold mb-0.5">{title}</p>}
          <div className="[&_a]:underline [&_a]:underline-offset-2">{children}</div>
        </div>
      </div>
    );
  }
);
Alert.displayName = "Alert";

export { Alert, alertVariants };
