export default function ExpensesLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div>
          <div className="h-7 w-40 bg-neutral-tint rounded-lg" />
          <div className="h-4 w-64 bg-neutral-tint rounded-lg mt-2" />
        </div>
        <div className="h-10 w-36 bg-neutral-tint rounded-lg" />
      </div>

      {/* Filter skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-48 bg-neutral-tint rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border">
          {[80, 120, 100, 160, 80, 100].map((w, i) => (
            <div
              key={i}
              className="h-3 bg-neutral-tint rounded"
              style={{ width: w }}
            />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0"
          >
            <div className="h-4 w-20 bg-neutral-tint rounded" />
            <div className="h-4 w-28 bg-neutral-tint rounded" />
            <div className="h-5 w-20 bg-neutral-tint rounded-md" />
            <div className="h-4 w-40 bg-neutral-tint rounded" />
            <div className="h-4 w-16 bg-neutral-tint rounded ms-auto" />
            <div className="h-4 w-24 bg-neutral-tint rounded" />
          </div>
        ))}
        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <div className="h-3 w-24 bg-neutral-tint rounded" />
          <div className="h-3 w-32 bg-neutral-tint rounded" />
        </div>
      </div>
    </div>
  );
}
