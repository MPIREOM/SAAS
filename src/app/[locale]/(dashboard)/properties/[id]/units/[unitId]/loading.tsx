export default function UnitDetailLoading() {
  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-36 bg-surface-elevated rounded-lg animate-pulse" />
        <div className="h-4 w-48 bg-surface-elevated rounded-lg animate-pulse mt-2" />
      </div>

      {/* Detail card skeleton */}
      <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-20 bg-surface-elevated rounded animate-pulse" />
              <div className="h-4 w-32 bg-surface-elevated rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Lease/tenant info skeleton */}
      <div className="bg-surface border border-border rounded-lg p-6 space-y-3">
        <div className="h-5 w-28 bg-surface-elevated rounded animate-pulse" />
        <div className="h-4 w-full bg-surface-elevated rounded animate-pulse" />
        <div className="h-4 w-3/4 bg-surface-elevated rounded animate-pulse" />
      </div>
    </div>
  );
}
