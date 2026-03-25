export default function TenantDetailLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-40 bg-surface-elevated rounded-lg animate-pulse" />
          <div className="h-4 w-56 bg-surface-elevated rounded-lg animate-pulse mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-surface-elevated rounded-md animate-pulse" />
          <div className="h-9 w-28 bg-surface-elevated rounded-md animate-pulse" />
        </div>
      </div>

      {/* Info cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-6 space-y-3">
            <div className="h-4 w-32 bg-surface-elevated rounded animate-pulse" />
            <div className="h-4 w-full bg-surface-elevated rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-surface-elevated rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-surface-elevated rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-surface border border-border rounded-lg">
        <div className="border-b border-border px-4 py-3">
          <div className="h-5 w-32 bg-surface-elevated rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b border-border/50 px-4 py-3.5">
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-4 bg-surface-elevated rounded animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
