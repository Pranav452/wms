interface Props {
  status: string
}

const COLORS: Record<string, string> = {
  COMPLETE:  'bg-green-100 text-green-700',
  PARTIAL:   'bg-yellow-100 text-yellow-700',
  PENDING:   'bg-gray-100 text-gray-600',
  'AWAITING GRN':       'bg-blue-100 text-blue-600',
  'LABEL PENDING':      'bg-orange-100 text-orange-600',
  'PACKING PENDING':    'bg-purple-100 text-purple-600',
  'DISPATCH PENDING':   'bg-red-100 text-red-600',
}

export default function StatusBadge({ status }: Props) {
  const cls = COLORS[status?.toUpperCase()] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}
