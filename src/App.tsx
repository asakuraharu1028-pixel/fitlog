import { useEffect, useState, Component, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'

// ── 公開し直したあと、古いページが消えた画面ファイルを読もうとして失敗したら、一度だけ再読み込みする ──
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i
const CHUNK_RELOAD_KEY = 'fitlog-chunk-reload-at'

/** 再読み込みしたら true。直前（10秒以内）に再読み込みしたばかりなら、繰り返さないよう false */
function reloadForStaleChunk(message: string): boolean {
  if (!CHUNK_ERROR.test(message)) return false
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
    if (Date.now() - last < 10_000) return false
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

window.addEventListener('vite:preloadError', (e) => {
  const err = (e as Event & { payload?: unknown }).payload
  if (reloadForStaleChunk(err instanceof Error ? err.message : String(err))) e.preventDefault()
})

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message + '\n' + e.stack } }
  componentDidCatch(e: Error) { reloadForStaleChunk(e.message) }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 16, background: '#fee', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
        <b>RENDER ERROR:</b>{'\n'}{this.state.error}
      </div>
    )
    return this.props.children
  }
}
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useAppStore } from './lib/store'
import { isNative, initAuth, signIn, signInSilent } from './lib/auth'
import { initReminderListeners, syncReminders } from './lib/reminders'
import { useStockStore } from './lib/stock'
import { initWidgetListeners } from './lib/widget'
import { autoSyncHealthConnect } from './lib/hcsync'
import LoginScreen from './components/LoginScreen'
import Layout from './components/Layout'

// ── ページはルート単位で遅延読み込み（初回バンドルを分割）──
// recharts(Report) や @zxing(Meal) など重いライブラリが別チャンクになる
const Home         = lazy(() => import('./pages/Home'))
const Meal         = lazy(() => import('./pages/Meal'))
const Exercise     = lazy(() => import('./pages/Exercise'))
const Body         = lazy(() => import('./pages/Body'))
const Report       = lazy(() => import('./pages/Report'))
const Calendar     = lazy(() => import('./pages/Calendar'))
const Settings     = lazy(() => import('./pages/Settings'))
const Menu         = lazy(() => import('./pages/Menu'))
const Stock        = lazy(() => import('./pages/Stock'))
const StockTags    = lazy(() => import('./pages/StockTags'))
const MealPlan     = lazy(() => import('./pages/MealPlan'))
const RecipeDB     = lazy(() => import('./pages/RecipeDB'))
const ShoppingList = lazy(() => import('./pages/ShoppingList'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))

// 遅延読み込み中のフォールバック
function PageLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-gray-400">
      読み込み中...
    </div>
  )
}

export default function App() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const isLoading = useAppStore((s) => s.isLoading)
  const [sdkReady, setSdkReady] = useState(isNative)

  // 起動時に1回だけ実行する（isAuthenticated に依存させると、ログイン直後に再実行されて読み込みが二重になる）
  useEffect(() => {
    const { setAuthenticated, loadData } = useAppStore.getState()
    if (isNative) {
      initReminderListeners()
      initWidgetListeners()
      initAuth().then(() => {
        signInSilent().then((token) => {
          if (token) { setAuthenticated(true); loadData() }
        })
      })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      setSdkReady(true)
      if (!useAppStore.getState().isAuthenticated) {
        initAuth().then(() => {
          signIn()
            .then(() => { setAuthenticated(true); loadData() })
            .catch((e) => { console.warn('Auto sign-in failed:', e) })
        })
      }
    }
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])

  // 日用品の在庫をログイン後と、アプリが前面に戻ったときに読み直す（30分以内なら前回の結果を使う）。
  // 新しく読めたら、棚卸し・要購入の通知を予約し直す
  useEffect(() => {
    if (!isAuthenticated) return
    const refreshStock = () => {
      useStockStore.getState().refresh().then(status => {
        if (status) syncReminders(useAppStore.getState().data)
      })
    }
    refreshStock()
    const onVisible = () => { if (document.visibilityState === 'visible') refreshStock() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isAuthenticated])

  // Android：Drive の読み込みが終わったら Health Connect と自動同期し、前面に戻るたびにも同期する
  // （権限がまだないときは何もしない。前回から15分以内なら飛ばす）
  useEffect(() => {
    if (!isNative || !isAuthenticated || isLoading) return
    autoSyncHealthConnect()
    const onVisible = () => { if (document.visibilityState === 'visible') autoSyncHealthConnect() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isAuthenticated, isLoading])

  // OAuthコールバックはログイン状態に関係なく表示
  return (
    <ErrorBoundary>
    <HashRouter>
      <Suspense fallback={<PageLoading />}>
      <Routes>
        {/* GitHub Pages経由のOAuthコールバック */}
        <Route path="/oauth-callback" element={<OAuthCallback />} />

        {/* メインアプリ */}
        <Route path="/*" element={
          !isAuthenticated
            ? <LoginScreen sdkReady={sdkReady} />
            : (
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="meal" element={<Meal />} />
                  <Route path="exercise" element={<Exercise />} />
                  <Route path="body" element={<Body />} />
                  <Route path="calendar" element={<Calendar />} />
                  <Route path="report" element={<Report />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="menu" element={<Menu />} />
                  <Route path="stock" element={<Stock />} />
                  <Route path="stock/tags" element={<StockTags />} />
                  <Route path="mealplan" element={<MealPlan />} />
                  <Route path="recipedb" element={<RecipeDB />} />
                  <Route path="shoppinglist" element={<ShoppingList />} />
                </Route>
              </Routes>
            )
        } />
      </Routes>
      </Suspense>
    </HashRouter>
    </ErrorBoundary>
  )
}
