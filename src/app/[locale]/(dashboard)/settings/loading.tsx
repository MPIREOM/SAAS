export default function SettingsLoading() {
  return (
    <div className="space-y-8 max-w-4xl animate-fade-in">
      <div>
        <div className="h-7 w-28 bg-neutral-tint rounded-lg animate-pulse" />
        <div className="h-4 w-56 bg-neutral-tint rounded-lg animate-pulse mt-2" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-xl shadow-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 bg-neutral-tint rounded-md animate-pulse" />
            <div>
              <div className="h-4 w-32 bg-neutral-tint rounded animate-pulse" />
              <div className="h-3 w-48 bg-neutral-tint rounded animate-pulse mt-1.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-12 bg-neutral-tint rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
