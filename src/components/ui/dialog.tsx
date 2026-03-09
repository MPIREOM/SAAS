import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

/* -------------------------------- Context --------------------------------- */

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialog() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("Dialog compound components must be used within <Dialog>");
  return ctx;
}

/* --------------------------------- Dialog --------------------------------- */

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

/* ------------------------------- DialogContent ----------------------------- */

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width class override, defaults to max-w-lg */
  maxWidth?: string;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, maxWidth = "max-w-lg", children, ...props }, ref) => {
    const { open, onOpenChange } = useDialog();
    const contentRef = React.useRef<HTMLDivElement>(null);

    // Close on Escape
    React.useEffect(() => {
      if (!open) return;
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") onOpenChange(false);
      }
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, onOpenChange]);

    // Lock body scroll
    React.useEffect(() => {
      if (!open) return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }, [open]);

    // Focus trap: focus the content on open
    React.useEffect(() => {
      if (open && contentRef.current) {
        contentRef.current.focus();
      }
    }, [open]);

    if (!open) return null;

    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => onOpenChange(false)}
        />

        {/* Content */}
        <div
          ref={(node) => {
            (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className={cn(
            "relative z-50 w-full rounded-xl border border-border bg-surface p-0 shadow-xl",
            "animate-in fade-in-0 zoom-in-95",
            maxWidth,
            className
          )}
          {...props}
        >
          {children}

          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              "absolute right-4 top-4 rounded-md p-1",
              "text-muted-foreground hover:text-foreground transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            )}
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>,
      document.body
    );
  }
);
DialogContent.displayName = "DialogContent";

/* ------------------------------- DialogHeader ------------------------------ */

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 p-6 pb-0", className)}
    {...props}
  />
));
DialogHeader.displayName = "DialogHeader";

/* ------------------------------- DialogTitle ------------------------------ */

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

/* ----------------------------- DialogDescription -------------------------- */

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

/* ------------------------------- DialogBody ------------------------------- */

const DialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6", className)} {...props} />
));
DialogBody.displayName = "DialogBody";

/* ------------------------------- DialogFooter ----------------------------- */

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center justify-end gap-3 p-6 pt-0", className)}
    {...props}
  />
));
DialogFooter.displayName = "DialogFooter";

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
};
