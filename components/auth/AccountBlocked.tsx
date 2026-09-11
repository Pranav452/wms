import { Ban, LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'

// Shown instead of the dashboard when the session cookie is still valid but
// the account has since been disabled or removed by an admin.
export default function AccountBlocked({ name }: { name: string }) {
  return (
    <div className="min-h-screen bg-[#f4f2f2] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-7 text-center">
        <div className="mx-auto w-11 h-11 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mb-4">
          <Ban className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">Account not active</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          {name}, your access to Bridge WMS has been switched off. Contact an administrator if you think this is a mistake.
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:bg-red-700"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
