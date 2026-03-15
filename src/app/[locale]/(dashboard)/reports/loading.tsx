export default function ReportsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="h-7 w-28 bg-surface-elevated rounded-lg animate-pulse" />
        <div className="h-4 w-48 bg-surface-elevated rounded-lg animate-pulse mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-5">
            <div className="h-9 w-9 bg-surface-elevated rounded-md animate-pulse mb-3" />
            <div className="h-5 w-36 bg-surface-elevated rounded animate-pulse mb-2" />
            <div className="h-3 w-full bg-surface-elevated rounded animate-pulse mb-1" />
            <div className="h-3 w-2/3 bg-surface-elevated rounded animate-pulse mb-4" />
            <div className="flex gap-2 pt-3 border-t border-border">
              <div className="h-8 w-16 bg-surface-elevated rounded-md animate-pulse" />
              <div className="h-8 w-16 bg-surface-elevated rounded-md animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
