import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/PasswordResetForms'

export const metadata: Metadata = { title: 'Forgot password · Bridge WMS' }

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
