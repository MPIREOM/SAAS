export default function InvoicesLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-28 bg-surface-elevated rounded-lg animate-pulse" />
          <div className="h-4 w-44 bg-surface-elevated rounded-lg animate-pulse mt-2" />
        </div>
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border/60 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 bg-surface-elevated rounded-lg animate-pulse" />
              <div className="h-3 w-16 bg-surface-elevated rounded animate-pulse" />
            </div>
            <div className="h-6 w-24 bg-surface-elevated rounded animate-pulse" />
            <div className="h-3 w-20 bg-surface-elevated rounded animate-pulse mt-2" />
          </div>
        ))}
      </div>

      {/* Tabs skeleton */}
      <div className="h-10 w-80 bg-surface border border-border rounded-lg animate-pulse" />

      {/* Table skeleton */}
      <div className="bg-surface border border-border/60 rounded-xl">
        <div className="px-5 pt-4 pb-3">
          <div className="h-1.5 bg-surface-elevated rounded-full animate-pulse" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b border-border/40 px-5 py-3.5">
            <div className="grid grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="h-4 bg-surface-elevated rounded animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
