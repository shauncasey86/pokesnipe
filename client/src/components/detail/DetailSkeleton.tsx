export function DetailSkeleton() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex gap-5">
        <div className="w-36 h-52 rounded-xl bg-surface shrink-0" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="flex gap-2">
            <div className="h-5 w-14 bg-surface rounded" />
            <div className="h-5 w-10 bg-surface rounded" />
          </div>
          <div className="h-6 bg-surface rounded w-4/5" />
          <div className="h-4 bg-surface rounded w-2/5" />
          <div className="h-12 bg-surface rounded w-full" />
          <div className="h-4 bg-surface rounded w-3/5" />
        </div>
      </div>

      {/* Pricing skeleton */}
      <div className="h-28 bg-surface rounded-xl" />

      {/* Signal cards skeleton */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>

      {/* Condition comps skeleton */}
      <div className="h-28 bg-surface rounded-xl" />

      {/* Trend skeleton */}
      <div className="h-20 bg-surface rounded-xl" />
    </div>
  );
}
