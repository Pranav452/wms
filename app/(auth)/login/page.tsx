import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/AuthForms'

export const metadata: Metadata = { title: 'Sign in · Bridge WMS' }

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[]; reset?: string | string[] }>
}) {
  const { next, reset } = await searchParams
  return (
    <LoginForm
      next={typeof next === 'string' ? next : ''}
      notice={reset === '1' ? 'Password updated — sign in with your new password.' : undefined}
    />
  )
}
