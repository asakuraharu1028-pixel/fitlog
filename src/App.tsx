import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useAppStore } from './lib/store'
import { isNative, initAuth, signIn, signInSilent } from './lib/auth'
import LoginScreen from './components/LoginScreen'
import Layout from './components/Layout'
import Home from './pages/Home'
import Meal from './pages/Meal'
import Exercise from './pages/Exercise'
import Body from './pages/Body'
import Report from './pages/Report'
import Settings from './pages/Settings'
import OAuthCallback from './pages/OAuthCallback'

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
    <HashRouter>
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
                  <Route path="report" element={<Report />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Routes>
            )
        } />
      </Routes>
    </HashRouter>
  )
}
