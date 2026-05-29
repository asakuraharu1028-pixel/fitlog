import { NavLink, Outlet } from 'react-router-dom'
import { Home, Utensils, Dumbbell, Scale, BarChart2 } from 'lucide-react'
import { useAppStore } from '../lib/store'

const navItems = [
  { to: '/', icon: Home, label: 'ホーム' },
  { to: '/meal', icon: Utensils, label: '食事' },
  { to: '/exercise', icon: Dumbbell, label: '運動' },
  { to: '/body', icon: Scale, label: '体重' },
  { to: '/report', icon: BarChart2, label: 'レポート' },
]

export default function Layout() {
  const { isSaving } = useAppStore()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 max-w-lg mx-auto">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold text-green-600">🥗 FitLog</h1>
        {isSaving && (
          <span className="text-xs text-gray-400">保存中...</span>
        )}
      </header>

      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-200">
        <ul className="flex">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center py-2 text-xs transition ${
                    isActive ? 'text-green-600' : 'text-gray-400'
                  }`
                }
              >
                <Icon size={20} />
                <span className="mt-0.5">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
