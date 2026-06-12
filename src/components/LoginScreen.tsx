import { useState } from 'react'
import { requestAccessToken, initGoogleAuth } from '../lib/google'
import { useAppStore } from '../lib/store'

interface Props {
  sdkReady: boolean
}

export default function LoginScreen({ sdkReady }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setAuthenticated, loadData } = useAppStore()

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      await initGoogleAuth()
      await requestAccessToken()
      setAuthenticated(true)
      await loadData()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`ログインに失敗しました: ${msg}`)
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-green-50 to-white p-6">
      <div className="mb-8 text-center">
        <div className="text-5xl mb-3">🥗</div>
        <h1 className="text-2xl font-bold text-gray-800">FitLog</h1>
        <p className="text-gray-500 mt-1 text-sm">食事・運動・体重を記録しよう</p>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
        <p className="text-gray-600 text-sm mb-6 text-center">
          Googleアカウントでサインインすると、<br />
          データをGoogleドライブに自動保存します
        </p>

        {error && (
          <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading || !sdkReady}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-xl py-3 px-4 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-50"
        >
          <img
            src="https://www.google.com/favicon.ico"
            alt="Google"
            className="w-5 h-5"
          />
          <span className="text-gray-700 font-medium">
            {!sdkReady ? '読み込み中...' : loading ? '接続中...' : 'Googleでサインイン'}
          </span>
        </button>
      </div>
    </div>
  )
}
