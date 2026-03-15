export default function MaintenanceLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-44 bg-surface-elevated rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-surface-elevated rounded-lg animate-pulse mt-2" />
        </div>
        <div className="h-9 w-32 bg-surface-elevated rounded-md animate-pulse" />
      </div>

      {/* Tabs skeleton */}
      <div className="h-10 w-72 bg-surface border border-border rounded-lg animate-pulse" />

      {/* Table skeleton */}
      <div className="bg-surface border border-border rounded-lg">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border/50 px-4 py-3.5">
            <div className="grid grid-cols-8 gap-4">
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} className="h-4 bg-surface-elevated rounded animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
