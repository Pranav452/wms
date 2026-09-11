import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/AuthForms'

export const metadata: Metadata = { title: 'Sign in · Bridge WMS' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  return <LoginForm next={typeof next === 'string' ? next : ''} />
}
