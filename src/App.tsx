import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useAppStore } from './lib/store'
import LoginScreen from './components/LoginScreen'
import Layout from './components/Layout'
import Home from './pages/Home'
import Meal from './pages/Meal'
import Exercise from './pages/Exercise'
import Body from './pages/Body'
import Report from './pages/Report'

export default function App() {
  const { isAuthenticated } = useAppStore()

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])

  if (!isAuthenticated) {
    return <LoginScreen />
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
        </Route>
      </Routes>
    </HashRouter>
  )
}
