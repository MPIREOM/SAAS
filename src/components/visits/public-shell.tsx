import { CalendarClock, AlertTriangle } from "lucide-react";
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
    <div className="min-h-screen bg-background noise-overlay">
      <header className="border-b border-border/60 bg-surface/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
            <CalendarClock aria-hidden="true" className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-text-primary font-display truncate">{title}</h1>
            {subtitle && <p className="text-xs text-text-secondary truncate">{subtitle}</p>}
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5 stagger-children">
        {children}
        <footer className="text-center py-2">
          <p className="text-xs text-text-secondary/50">MPIRE Property Management</p>
        </footer>
      </main>
    </div>
  );
}

export function PublicVisitLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-background noise-overlay flex flex-col items-center justify-center gap-3 p-4">
      <Spinner label={label} sizeClassName="h-8 w-8" />
      <p aria-hidden="true" className="text-sm text-text-secondary">
        {label}
      </p>
    </div>
  );
}

export function PublicVisitMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-background noise-overlay flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center animate-fade-in-up">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/25">
          <AlertTriangle aria-hidden="true" className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary font-display">{title}</h1>
        <Alert variant="destructive" className="text-start">
          {message}
        </Alert>
        <p className="text-xs text-text-secondary/50 pt-2">MPIRE Property Management</p>
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
