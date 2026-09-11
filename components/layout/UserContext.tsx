"use client";

import { createContext, useContext } from 'react'
import type { SessionUser } from '@/types/auth'

// Signed-in user, handed down by DashboardShell from the server-side session
const Ctx = createContext<SessionUser | null>(null)

export const UserProvider = Ctx.Provider
export function useCurrentUser(): SessionUser {
  const user = useContext(Ctx)
  if (!user) throw new Error('useCurrentUser must be inside DashboardShell')
  return user
}
