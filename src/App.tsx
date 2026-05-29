import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useAppStore } from './lib/store'
import { initGoogleAuth, requestAccessToken } from './lib/google'
import LoginScreen from './components/LoginScreen'
import Layout from './components/Layout'
import Home from './pages/Home'
import Meal from './pages/Meal'
import Exercise from './pages/Exercise'
import Body from './pages/Body'
import Report from './pages/Report'
import Settings from './pages/Settings'

export default function App() {
  const { isAuthenticated, setAuthenticated, loadData } = useAppStore()
  const [sdkReady, setSdkReady] = useState(false)

  // Google SDK ロード
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => setSdkReady(true)
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])

  // SDK 準備完了後にサイレント再認証を試みる
  useEffect(() => {
    if (!sdkReady || isAuthenticated) return
    initGoogleAuth().then(() => {
      // prompt: '' でポップアップなしの再認証を試みる
      requestAccessToken()
        .then(() => {
          setAuthenticated(true)
          loadData()
        })
        .catch(() => {
          // サイレント失敗 → ログイン画面を表示（正常）
        })
    })
  }, [sdkReady, isAuthenticated, setAuthenticated, loadData])

  if (!isAuthenticated) {
    return <LoginScreen sdkReady={sdkReady} />
  }

  return (
    <HashRouter>
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
    </HashRouter>
  )
}
