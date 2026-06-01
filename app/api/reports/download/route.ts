import { NextRequest, NextResponse } from 'next/server'
import net from 'net'

const API_BASE_HOST = '180.179.207.163'
const API_BASE_PATH = '/ApiMP/api/Import'

const PATHS: Record<string, string> = {
  stock:      'IMP_WMS_SHIPMENTWISE_STOCKSTATUS_XL',
  itemstatus: 'IMP_WMS_SHIPMENTWISE_ITEMSTATUS_ALL_MRPQTY_XL',
}

function rawHttpGet(host: string, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket  = new net.Socket()
    const chunks: Buffer[] = []
    let   settled = false

    const done = (err?: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      if (err) return reject(err)
      const raw      = Buffer.concat(chunks)
      const sep      = raw.indexOf('\r\n\r\n')
      const bodyBuf  = sep >= 0 ? raw.slice(sep + 4) : raw
      resolve(bodyBuf)
    }

    socket.setTimeout(120_000)
    socket.on('timeout', () => done(new Error('Request timed out')))
    socket.on('error',   (e) => done(e))
    socket.on('data',    (chunk: Buffer) => chunks.push(chunk))
    socket.on('end',     () => done())

    socket.connect(80, host, () => {
      socket.write(
        `GET ${path} HTTP/1.0\r\nHost: ${host}\r\nConnection: close\r\n\r\n`
      )
    })
  })
}

export async function GET(req: NextRequest) {
  const sp          = req.nextUrl.searchParams
  const type        = sp.get('type') ?? 'stock'
  const asondate    = sp.get('asondate') ?? new Date().toLocaleDateString('en-GB')
  const cmpcode     = sp.get('cmpcode')  ?? '01'
  const citycode    = sp.get('citycode') ?? 'MUM'
  const containerno = sp.get('containerno') ?? 'All'

  const path = PATHS[type]
  if (!path) return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })

  const qs  = `CONTAINERNO=${encodeURIComponent(containerno)}&CMPCODE=${encodeURIComponent(cmpcode)}&CITYCODE=${encodeURIComponent(citycode)}&ASONDATE=${asondate}`
  const url = `http://${API_BASE_HOST}${API_BASE_PATH}/${path}?${qs}`

  const parsed   = new URL(url)
  const fullPath = parsed.pathname + parsed.search

  console.log('[reports/download] raw TCP GET', API_BASE_HOST, fullPath)

  try {
    const body = await rawHttpGet(API_BASE_HOST, fullPath)
    console.log('[reports/download] body bytes:', body.length)

    const dateSlug = asondate.replace(/\//g, '-')
    const filename = `${type}-report-${dateSlug}.xls`

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type':        'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reports/download] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
