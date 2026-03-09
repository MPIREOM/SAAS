import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={cn(
          "animate-pulse rounded-lg bg-muted/50",
          className
        )}
        {...props}
      />
    );
  }
);
Skeleton.displayName = "Skeleton";

export { Skeleton };
