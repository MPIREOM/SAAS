export default function DocumentsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 bg-neutral-tint rounded-lg animate-pulse" />
          <div className="h-4 w-56 bg-neutral-tint rounded-lg animate-pulse mt-2" />
        </div>
        <div className="h-9 w-36 bg-neutral-tint rounded-md animate-pulse" />
      </div>
      <div className="bg-surface border border-border rounded-xl shadow-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border px-4 py-3.5">
            <div className="grid grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-4 bg-neutral-tint rounded animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
