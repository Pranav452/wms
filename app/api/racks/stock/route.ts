import { NextRequest, NextResponse } from 'next/server'
import { getPool, sql } from '@/lib/db'
import { buildRackStock, type RawStockRow } from '@/lib/rackstock'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cmpcode  = searchParams.get('cmpcode')  || '01'
  const citycode = searchParams.get('citycode') || 'MUM'

  try {
    const pool    = await getPool()
    const request = pool.request()
    request.input('CMPCODE',  sql.VarChar(3), cmpcode)
    request.input('CITYCODE', sql.VarChar(3), citycode)

    const result = await request.query(`
      SELECT rackNo, EAN, SKU, ItemName, Size, color, currentstock, qty, containerno
      FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR
      WHERE currentstock > 0
        AND Cmpcode = @CMPCODE AND Citycode = @CITYCODE`)

    const data = buildRackStock(result.recordset as RawStockRow[])

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
