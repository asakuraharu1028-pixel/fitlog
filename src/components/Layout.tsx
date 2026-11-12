import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, Utensils, Dumbbell, Scale, LayoutGrid } from 'lucide-react'
import { useAppStore } from '../lib/store'
import { MENU_PATHS } from '../lib/menu'

const navItems = [
  { to: '/', icon: Home, label: 'ホーム' },
  { to: '/meal', icon: Utensils, label: '食事' },
  { to: '/exercise', icon: Dumbbell, label: '運動' },
  { to: '/body', icon: Scale, label: '体重' },
  { to: '/menu', icon: LayoutGrid, label: 'メニュー' },
]

export default function Layout() {
  const { isSaving } = useAppStore()
  const { pathname } = useLocation()
  // カレンダー・レポート・献立・設定などはメニューから開くので、そのときはメニュータブを選択中にする
  const inMenu = MENU_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 max-w-lg mx-auto">
      <header className="bg-white/90 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold text-green-600">🥗 FitLog</h1>
        {isSaving && (
          <span className="text-xs text-gray-400">保存中...</span>
        )}
      </header>

      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
        <ul className="flex">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) => {
                  const active = isActive || (to === '/menu' && inMenu)
                  return `flex flex-col items-center pt-2 pb-1.5 text-[11px] transition ${
                    active ? 'text-green-600 font-semibold' : 'text-gray-400'
                  }`
                }}
              >
                {({ isActive }) => {
                  const active = isActive || (to === '/menu' && inMenu)
                  return (
                    <>
                      <span className={`flex items-center justify-center w-12 h-7 rounded-full transition ${active ? 'bg-green-50' : ''}`}>
                        <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                      </span>
                      <span className="mt-0.5">{label}</span>
                    </>
                  )
                }}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
