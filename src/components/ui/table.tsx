import * as React from "react";
import { cn } from "@/lib/utils/cn";

/* ---------------------------------- Table --------------------------------- */

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

/* ------------------------------- TableHeader ------------------------------ */

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("sticky top-0 z-10 bg-surface [&_tr]:border-b", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

/* -------------------------------- TableBody ------------------------------- */

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

/* -------------------------------- TableRow -------------------------------- */

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "h-10 border-b border-border transition-colors",
      "hover:bg-surface-hover/50",
      "data-[state=selected]:bg-accent/10",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

/* -------------------------------- TableHead ------------------------------- */

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground",
      "[&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

/* -------------------------------- TableCell ------------------------------- */

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-3 py-2 align-middle text-sm",
      "[&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
