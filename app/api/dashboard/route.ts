import { NextRequest, NextResponse } from 'next/server'
import { getPool, sql } from '@/lib/db'
import type { DashboardData } from '@/types/dashboard'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cmpcode  = searchParams.get('cmpcode')  || '01'
  const citycode = searchParams.get('citycode') || 'MUM'
  const today    = new Date().toLocaleDateString('en-GB')
  const asondate = searchParams.get('asondate') || today

  try {
    const pool    = await getPool()
    const request = pool.request()
    request.input('CMPCODE',  sql.VarChar(2),  cmpcode)
    request.input('CITYCODE', sql.VarChar(3),  citycode)
    request.input('ASONDATE', sql.VarChar(10), asondate)

    const result = await request.execute('USP_WMS_DASHBOARD_V3')
    const rs     = result.recordsets as unknown[][]

    const data: DashboardData = {
      kpi:                    (rs[0]?.[0]  ?? null) as DashboardData['kpi'],
      shipTypes:              (rs[1]  ?? [])        as DashboardData['shipTypes'],
      stockDetail:            (rs[2]  ?? [])        as DashboardData['stockDetail'],
      agingBuckets:           (rs[3]  ?? [])        as DashboardData['agingBuckets'],
      mrpPending:             (rs[4]  ?? [])        as DashboardData['mrpPending'],
      monthlyTrend:           (rs[5]  ?? [])        as DashboardData['monthlyTrend'],
      labelStatus:            (rs[6]?.[0]  ?? null) as DashboardData['labelStatus'],
      dailyDispatch:          (rs[7]  ?? [])        as DashboardData['dailyDispatch'],
      backlog:                (rs[8]?.[0]  ?? null) as DashboardData['backlog'],
      clientDispatch:         (rs[9]  ?? [])        as DashboardData['clientDispatch'],
      poVsDispatch:           (rs[10] ?? [])        as DashboardData['poVsDispatch'],
      poTracking:             (rs[11] ?? [])        as DashboardData['poTracking'],
      containers:             (rs[12] ?? [])        as DashboardData['containers'],
      clientReceipt:          (rs[13] ?? [])        as DashboardData['clientReceipt'],
      mrpDaily:               (rs[14] ?? [])        as DashboardData['mrpDaily'],
      mrpPendingContainers:   (rs[15] ?? [])        as DashboardData['mrpPendingContainers'],
      articleTypes:           (rs[16] ?? [])        as DashboardData['articleTypes'],
      deliveryAgents:         (rs[17] ?? [])        as DashboardData['deliveryAgents'],
      grnDaily:               (rs[18] ?? [])        as DashboardData['grnDaily'],
      poValue:                (rs[19] ?? [])        as DashboardData['poValue'],
      asOnDate:               asondate,
      fetchedAt:              new Date().toISOString(),
    }

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
