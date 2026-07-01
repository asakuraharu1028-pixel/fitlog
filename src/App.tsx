import { useEffect, useState, Component, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message + '\n' + e.stack } }
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
  const { isAuthenticated, setAuthenticated, loadData } = useAppStore()
  const [sdkReady, setSdkReady] = useState(isNative)

  useEffect(() => {
    if (isNative) {
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
      if (!isAuthenticated) {
        initAuth().then(() => {
          signIn()
            .then(() => { setAuthenticated(true); loadData() })
            .catch((e) => { console.warn('Auto sign-in failed:', e) })
        })
      }
    }
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [isAuthenticated, setAuthenticated, loadData])

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
