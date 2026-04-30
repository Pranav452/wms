// Convert yyyy-MM-dd (HTML date input) → dd/MM/yyyy (SP format)
export function toSPDate(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

// Today as yyyy-MM-dd (for HTML date input default)
export function todayYMD(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-IN')
}

// Convert MONTH_KEY "202504" → "Apr '25"
export function formatMonthKey(key: string): string {
  if (!key || key.length < 6) return key
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const m = parseInt(key.slice(4, 6)) - 1
  const y = key.slice(2, 4)
  return `${months[m]} '${y}`
}

export function pct(num: number, den: number): number {
  if (!den) return 0
  return Math.min(100, Math.round((num / den) * 100))
}
