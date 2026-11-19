import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, Utensils, Dumbbell, Scale, LayoutGrid } from 'lucide-react'
import { useAppStore } from '../lib/store'
import { MENU_PATHS } from '../lib/menu'
import { isNative, signIn, signInSilent } from '../lib/auth'

/**
 * Drive に保存・読み込みできなかったときの帯。
 * 多くはログインの期限切れなので、「つなぎ直す」でログインし直してから Drive を読み直す
 * （読み直しのマージで、この端末にしかない記録も Drive に書き戻される）。
 * 次に保存か読み込みが成功すると、store が driveError を空にするので帯は消える
 */
function DriveErrorBanner({ message }: { message: string }) {
  const [busy, setBusy] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const reconnect = async () => {
    setBusy(true)
    setRetryError(null)
    try {
      // Web はボタンを押した操作の中でログインするので、ポップアップが止められない
      const token = isNative ? (await signInSilent()) ?? (await signIn()) : await signIn()
      if (!token) throw new Error('ログインできませんでした')
      await useAppStore.getState().loadData()
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="alert" className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Drive に保存できていません。記録はこの端末に残っています</p>
        <button
          type="button"
          onClick={reconnect}
          disabled={busy}
          className="shrink-0 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'つなぎ直し中...' : 'つなぎ直す'}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-red-500 break-all">{retryError ?? message}</p>
    </div>
  )
}

const navItems = [
  { to: '/', icon: Home, label: 'ホーム' },
  { to: '/meal', icon: Utensils, label: '食事' },
  { to: '/exercise', icon: Dumbbell, label: '運動' },
  { to: '/body', icon: Scale, label: '体重' },
  { to: '/menu', icon: LayoutGrid, label: 'メニュー' },
]

export default function Layout() {
  const { isSaving, driveError } = useAppStore()
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
      {driveError && <DriveErrorBanner message={driveError} />}

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
