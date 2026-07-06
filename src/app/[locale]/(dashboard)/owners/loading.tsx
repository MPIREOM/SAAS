export default function OwnersLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-36 bg-surface-elevated rounded-lg animate-pulse" />
          <div className="h-4 w-56 bg-surface-elevated rounded-lg animate-pulse mt-2" />
        </div>
        <div className="h-9 w-36 bg-surface-elevated rounded-md animate-pulse" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border/40 rounded-xl p-4">
            <div className="h-3 w-16 bg-surface-elevated rounded animate-pulse mb-3" />
            <div className="h-7 w-24 bg-surface-elevated rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Ledger table skeleton */}
      <div className="bg-surface border border-border/40 rounded-xl p-5 space-y-3">
        <div className="h-5 w-40 bg-surface-elevated rounded animate-pulse mb-4" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 bg-surface-elevated rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}
