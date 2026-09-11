import type { Metadata } from 'next'
import { SignupForm } from '@/components/auth/AuthForms'

export const metadata: Metadata = { title: 'Create account · Bridge WMS' }

export default function SignupPage() {
  return <SignupForm />
}
