"use client";

import { createContext, useContext } from 'react'

interface SidebarCtx {
  openSidebar: () => void
}

const Ctx = createContext<SidebarCtx>({ openSidebar: () => {} })

export const SidebarProvider = Ctx.Provider
export const useSidebar = () => useContext(Ctx)
