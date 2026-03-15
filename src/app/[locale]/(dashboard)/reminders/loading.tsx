export default function RemindersLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-44 bg-surface-elevated rounded-lg animate-pulse" />
          <div className="h-4 w-56 bg-surface-elevated rounded-lg animate-pulse mt-2" />
        </div>
        <div className="h-9 w-36 bg-surface-elevated rounded-md animate-pulse" />
      </div>
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="h-5 w-32 bg-surface-elevated rounded animate-pulse mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-surface-elevated rounded-lg animate-pulse mb-2" />
        ))}
      </div>
    </div>
  );
}
