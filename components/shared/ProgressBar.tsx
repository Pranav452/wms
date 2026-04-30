interface Props {
  value: number   // 0–100
  showLabel?: boolean
}

export default function ProgressBar({ value, showLabel = true }: Props) {
  const clamped = Math.min(100, Math.max(0, value))
  const color = clamped >= 90 ? 'bg-green-500' : clamped >= 50 ? 'bg-red-500' : 'bg-yellow-500'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${clamped}%` }} />
      </div>
      {showLabel && <span className="text-xs text-gray-600 w-8 text-right">{clamped}%</span>}
    </div>
  )
}
