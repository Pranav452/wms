import Sidebar from './Sidebar'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f4f2f2] font-sans text-gray-800 p-4 gap-6">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  )
}
