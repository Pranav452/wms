"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { DashboardData } from '@/types/dashboard'
import { todayYMD, toSPDate } from '@/lib/utils'

interface DashboardCtx {
  data:        DashboardData | null
  loading:     boolean
  error:       string | null
  asOnDate:    string           // yyyy-MM-dd (for <input type="date">)
  setAsOnDate: (d: string) => void
  refresh:     () => void
}

const Ctx = createContext<DashboardCtx | null>(null)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [asOnDate, setAsOnDate] = useState(todayYMD)
  const [data, setData]         = useState<DashboardData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [tick, setTick]         = useState(0)

  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const spDate = toSPDate(asOnDate)
    fetch(`/api/dashboard?asondate=${encodeURIComponent(spDate)}`)
      .then(r => {
        if (!r.ok) return r.json().then((j: { error?: string }) => Promise.reject(j.error || 'Request failed'))
        return r.json() as Promise<DashboardData>
      })
      .then(d => {
        if (!cancelled) { setData(d); setLoading(false) }
      })
      .catch((e: unknown) => {
        if (!cancelled) { setError(String(e)); setLoading(false) }
      })

    return () => { cancelled = true }
  }, [asOnDate, tick])

  return (
    <Ctx.Provider value={{ data, loading, error, asOnDate, setAsOnDate, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

export function useDashboard() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDashboard must be inside DashboardProvider')
  return ctx
}
