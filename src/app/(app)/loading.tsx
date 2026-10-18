export default function AppLoading() {
  return (
    <div className="flex min-h-[80vh] flex-col gap-6 p-6 animate-pulse" aria-busy="true" aria-label="Memuat data operasional">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-4 w-32 rounded bg-surface-muted" />
        <div className="h-7 w-64 rounded bg-surface-muted" />
        <div className="h-4 w-80 rounded bg-surface-muted" />
      </div>

      {/* Notice Skeleton */}
      <div className="h-14 w-full rounded-lg border border-border bg-surface-subtle" />

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 h-28">
            <div className="h-3.5 w-24 rounded bg-surface-muted" />
            <div className="h-8 w-16 rounded bg-surface-muted" />
            <div className="h-3 w-32 rounded bg-surface-muted" />
          </div>
        ))}
      </div>

      {/* Content / Table Skeleton */}
      <div className="rounded-lg border border-border bg-surface p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="h-5 w-44 rounded bg-surface-muted" />
          <div className="h-8 w-32 rounded bg-surface-muted" />
        </div>
        {[1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-none">
            <div className="h-4 w-36 rounded bg-surface-muted" />
            <div className="h-4 w-48 rounded bg-surface-muted" />
            <div className="h-4 w-20 rounded bg-surface-muted" />
            <div className="h-4 w-16 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
