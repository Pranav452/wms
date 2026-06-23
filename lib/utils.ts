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

// Parse SP date string "dd/MM/yyyy" → epoch ms. Returns 0 for empty/invalid.
// SP returns dates as dd/MM/yyyy strings; localeCompare on these sorts by
// day-of-month, NOT chronologically — use this for any date-series sort.
export function parseSPDate(s: string | null | undefined): number {
  if (!s) return 0
  const [d, m, y] = s.split('/').map(Number)
  if (!d || !m || !y) return 0
  return new Date(y, m - 1, d).getTime()
}

// Chronological comparator for SP "dd/MM/yyyy" date strings (ascending).
export function bySPDate(a: string, b: string): number {
  return parseSPDate(a) - parseSPDate(b)
}

// Keep rows whose SP date falls within the last `days` days ending at `anchor`
// (an SP "dd/MM/yyyy" string, defaults to today). Use this for range filters —
// slicing by element count breaks when the series has gaps (only active days).
const DAY_MS = 86_400_000
export function lastNDays<T>(rows: T[], dateKey: keyof T, days: number, anchor?: string): T[] {
  const end = anchor ? parseSPDate(anchor) : parseSPDate(todayYMD().split('-').reverse().join('/'))
  const start = end - days * DAY_MS
  return rows.filter(r => {
    const t = parseSPDate(r[dateKey] as unknown as string)
    return t >= start && t <= end
  })
}
