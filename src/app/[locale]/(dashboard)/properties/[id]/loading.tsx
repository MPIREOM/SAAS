export default function PropertyDetailLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 bg-surface-elevated rounded-lg animate-pulse" />
          <div className="h-4 w-32 bg-surface-elevated rounded-lg animate-pulse mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-surface-elevated rounded-md animate-pulse" />
          <div className="h-9 w-24 bg-surface-elevated rounded-md animate-pulse" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-4">
            <div className="h-3 w-20 bg-surface-elevated rounded animate-pulse" />
            <div className="h-6 w-16 bg-surface-elevated rounded animate-pulse mt-2" />
          </div>
        ))}
      </div>

      {/* Units table skeleton */}
      <div className="bg-surface border border-border rounded-lg">
        <div className="border-b border-border px-4 py-3">
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-3 bg-surface-elevated rounded animate-pulse" />
            ))}
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border/50 px-4 py-3.5">
            <div className="grid grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-4 bg-surface-elevated rounded animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
