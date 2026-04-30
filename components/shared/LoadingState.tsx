export function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading data…</p>
      </div>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-64">
      <div className="text-center">
        <p className="text-red-500 font-medium text-sm mb-1">Failed to load data</p>
        <p className="text-xs text-gray-500 max-w-sm">{message}</p>
      </div>
    </div>
  )
}
