// What the activity log records, with the labels the Activity page shows.
// Shared by the browser (to report exports and page visits) and the server
// (which accepts only these keys, never free text).

export const DOWNLOADS = {
  'stock-status-report': 'Stock Status report',
  'item-status-report':  'Item Status (MRP) report',
  'stock-by-sku':        'Stock by SKU export',
  'no-location-stock':   'No-location stock export',
  'mrp-mismatch':        'MRP mismatch export',
} as const

export type DownloadKey = keyof typeof DOWNLOADS

// Dashboard pages whose visits are logged. Settings and Activity itself are left out.
export const TRACKED_PAGES = {
  '/overview':   'Overview',
  '/stock':      'Stock Detail',
  '/racks':      'Rack Management',
  '/containers': 'Containers',
  '/dispatch':   'Dispatch',
  '/grn':        'GRN & Trends',
  '/mrp':        'MRP / Labels',
  '/po':         'PO Tracking',
  '/rtv':        'RTV Returns',
} as const

export type TrackedPage = keyof typeof TRACKED_PAGES

export function isDownloadKey(value: unknown): value is DownloadKey {
  return typeof value === 'string' && Object.hasOwn(DOWNLOADS, value)
}

export function isTrackedPage(value: unknown): value is TrackedPage {
  return typeof value === 'string' && Object.hasOwn(TRACKED_PAGES, value)
}
