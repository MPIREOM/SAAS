import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

// Page chrome for the public (tenant-facing) visit pages, matching the
// maintenance-request link.

export function PublicVisitShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-[15px] font-bold text-accent-foreground"
          >
            M
          </span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-text-primary font-display truncate">{title}</h1>
            {subtitle && <p className="text-[13px] text-text-secondary truncate">{subtitle}</p>}
          </div>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 pt-5 pb-10 space-y-4">
        {children}
        <footer className="text-center py-2">
          <p className="text-xs text-text-tertiary">MPIRE Property Management</p>
        </footer>
      </main>
    </div>
  );
}

export function PublicVisitLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-4">
      <Spinner label={label} sizeClassName="h-8 w-8" />
      <p aria-hidden="true" className="text-sm text-text-secondary">
        {label}
      </p>
    </div>
  );
}

export function PublicVisitMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-destructive-tint">
          <AlertTriangle aria-hidden="true" className="h-7 w-7 text-destructive-text" />
        </div>
        <h1 className="text-[22px] font-bold text-text-primary font-display">{title}</h1>
        <Alert variant="destructive" className="text-start">
          {message}
        </Alert>
        <p className="text-xs text-text-tertiary pt-2">MPIRE Property Management</p>
      </div>
    </div>
  );
}

export interface PublicVisitInfo {
  title: string;
  notes: string | null;
  property_name: string;
  start_date: string;
  end_date: string;
  slot_minutes: number;
}
