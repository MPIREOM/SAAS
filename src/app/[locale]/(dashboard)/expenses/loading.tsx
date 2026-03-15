export default function ExpensesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div>
          <div className="h-7 w-40 bg-surface-elevated rounded-lg" />
          <div className="h-4 w-64 bg-surface-elevated rounded-lg mt-2" />
        </div>
        <div className="h-10 w-36 bg-surface-elevated rounded-lg" />
      </div>

      {/* Filter skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-48 bg-surface-elevated rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="bg-surface border border-border/60 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border/40">
          {[80, 120, 100, 160, 80, 100].map((w, i) => (
            <div
              key={i}
              className="h-3 bg-surface-elevated rounded"
              style={{ width: w }}
            />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-4 border-b border-border/20 last:border-0"
          >
            <div className="h-4 w-20 bg-surface-elevated rounded" />
            <div className="h-4 w-28 bg-surface-elevated rounded" />
            <div className="h-5 w-20 bg-surface-elevated rounded-md" />
            <div className="h-4 w-40 bg-surface-elevated rounded" />
            <div className="h-4 w-16 bg-surface-elevated rounded ms-auto" />
            <div className="h-4 w-24 bg-surface-elevated rounded" />
          </div>
        ))}
        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between">
          <div className="h-3 w-24 bg-surface-elevated rounded" />
          <div className="h-3 w-32 bg-surface-elevated rounded" />
        </div>
      </div>
    </div>
  );
}
