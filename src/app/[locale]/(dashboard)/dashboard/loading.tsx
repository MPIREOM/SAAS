export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-40 bg-surface-elevated rounded-lg animate-pulse" />
        <div className="h-4 w-64 bg-surface-elevated rounded-lg animate-pulse mt-2" />
      </div>

      {/* Stats Grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-border/40 rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="h-3 w-20 bg-surface-elevated rounded animate-pulse" />
              <div className="h-8 w-8 bg-surface-elevated rounded-lg animate-pulse" />
            </div>
            <div className="h-8 w-16 bg-surface-elevated rounded-lg animate-pulse" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="bg-surface border border-border/40 rounded-xl p-6">
        <div className="h-5 w-40 bg-surface-elevated rounded animate-pulse mb-6" />
        <div className="h-64 bg-surface-elevated rounded-lg animate-pulse" />
      </div>

      {/* Bottom grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-border/40 rounded-xl p-6"
          >
            <div className="h-5 w-32 bg-surface-elevated rounded animate-pulse mb-5" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div
                  key={j}
                  className="h-12 bg-surface-elevated rounded-lg animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
