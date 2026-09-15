import { Warehouse } from 'lucide-react'

// Deliberately outside the (dashboard) group: a user forced to change their
// password is redirected here from the dashboard layout, so this page must not
// run that same redirect.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f2f2] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 text-red-500 font-bold text-xl tracking-tight mb-6">
          <div className="w-7 h-7 bg-red-500 rounded-md rotate-45 flex items-center justify-center flex-shrink-0">
            <div className="w-3.5 h-3.5 bg-white rounded-sm -rotate-45" />
          </div>
          <Warehouse className="w-6 h-6 flex-shrink-0" />
          <span>Bridge WMS</span>
        </div>

        {children}

        <p className="text-center text-xs text-gray-400 mt-6">Seaport Logistics · Mumbai warehouse</p>
      </div>
    </div>
  )
}
