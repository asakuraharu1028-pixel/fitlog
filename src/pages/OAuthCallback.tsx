// Android からブラウザ経由で開かれるOAuthコールバックページ
// access_token をハッシュから取り出してネイティブアプリに渡す
import { useEffect, useState } from 'react'

export default function OAuthCallback() {
  const [status, setStatus] = useState('処理中...')

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const token = params.get('access_token')
    const error = params.get('error')

    if (token) {
      // ネイティブアプリにトークンを渡す（カスタムスキーム）
      const deepLink = `com.fitlog.app://oauth?access_token=${encodeURIComponent(token)}`
      setStatus('認証完了！アプリに戻ります...')
      window.location.href = deepLink
    } else if (error) {
      setStatus(`エラー: ${error}`)
    } else {
      setStatus('トークンが見つかりませんでした')
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white">
      <div className="text-center p-8">
        <div className="text-4xl mb-4">🥗</div>
        <p className="text-gray-600">{status}</p>
        <p className="text-xs text-gray-400 mt-2">このページは自動で閉じられます</p>
      </div>
    </div>
  )
}
