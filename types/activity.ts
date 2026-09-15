export type ActivityEvent = 'download' | 'page_view'

// One row of the admin Activity page (GET /api/admin/activity)
export interface ActivityRow {
  id:         number
  username:   string
  name:       string | null   // current full name; null if the account has since been removed
  role:       string          // role at the time of the event
  event:      ActivityEvent
  target:     string          // key from lib/activity/catalog.ts
  detail:     string | null
  createdAt:  string          // server wall-clock tagged as UTC — format with timeZone: 'UTC'
  ageSeconds: number          // how long ago, measured on the DB clock
}
