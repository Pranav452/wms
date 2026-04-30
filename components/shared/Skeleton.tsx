export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
  )
}

export function KPICardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-7 h-7 rounded-md" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

export function ChartCardSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <Skeleton className="h-4 w-40 mb-5" />
      <Skeleton className={`w-full rounded-xl`} style={{ height }} />
    </div>
  )
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-6">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="p-4 border-t flex justify-between items-center">
        <Skeleton className="h-3 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-16 rounded-lg" />
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

// Overview page skeleton
export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: headline + 8 KPIs */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-4 bg-[#1e1e1e] rounded-2xl p-6 flex flex-col justify-between h-44">
          <Skeleton className="w-10 h-10 rounded-lg bg-white/10" />
          <div>
            <Skeleton className="h-10 w-32 bg-white/20 mb-2" />
            <Skeleton className="h-3 w-16 bg-white/10" />
          </div>
        </div>
        <div className="col-span-12 sm:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <KPICardSkeleton key={i} />)}
        </div>
      </div>
      {/* Row 2 */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-3 bg-white rounded-2xl p-4 shadow-sm">
          <Skeleton className="h-4 w-24 mb-4" />
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        </div>
        <ChartCardSkeleton height={200} />
        <div className="col-span-12 sm:col-span-4 bg-white rounded-2xl p-4 shadow-sm">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <div className="space-y-2 mt-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-4" />)}
          </div>
        </div>
      </div>
      {/* Row 3 */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-8 bg-white rounded-2xl p-5 shadow-sm">
          <Skeleton className="h-4 w-40 mb-5" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i}>
                <div className="flex justify-between mb-1.5">
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-12 sm:col-span-4 bg-white rounded-2xl p-5 shadow-sm">
          <Skeleton className="h-4 w-36 mb-5" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="text-center">
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
                <Skeleton className="h-3 w-14 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// GRN page skeleton
export function GRNSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>
      <ChartCardSkeleton height={200} />
      <ChartCardSkeleton height={260} />
      <ChartCardSkeleton height={180} />
    </div>
  )
}

// Dispatch page skeleton
export function DispatchSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>
      <ChartCardSkeleton height={220} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCardSkeleton height={200} />
        <ChartCardSkeleton height={200} />
      </div>
      <TableSkeleton rows={5} />
    </div>
  )
}

// MRP page skeleton
export function MRPSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex justify-between mb-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-4 w-full rounded-full" />
        <div className="flex gap-4 mt-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-3 w-28" />)}
        </div>
      </div>
      <TableSkeleton rows={6} />
      <ChartCardSkeleton height={200} />
      <TableSkeleton rows={5} />
    </div>
  )
}

// PO page skeleton
export function POSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>
      <Skeleton className="h-12 rounded-xl" />
      <TableSkeleton rows={10} />
    </div>
  )
}

// Stock page skeleton
export function StockSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}
      </div>
      <TableSkeleton rows={12} />
    </div>
  )
}

// Containers page skeleton
export function ContainersSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-7 w-14 rounded-full" />)}
      </div>
      <TableSkeleton rows={10} />
    </div>
  )
}
