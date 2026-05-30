import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { initGoogleAuth, requestAccessToken, setAccessToken } from './google'

export const isNative = Capacitor.isNativePlatform()

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

// Android サインイン用クライアント（Android OAuth クライアント）
const ANDROID_CLIENT_ID = '685129420203-dufioist84icrt495iahbbqh67b76p6p.apps.googleusercontent.com'
// Web クライアントのシークレット（ビルド時に環境変数から注入）
const WEB_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string

export async function initAuth(): Promise<void> {
  if (isNative) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (GoogleAuth as any).initialize({
      clientId: ANDROID_CLIENT_ID,
      serverClientId: WEB_CLIENT_ID, // Web クライアントの serverAuthCode を要求
      scopes: [DRIVE_SCOPE],
      grantOfflineAccess: true,
    })
  } else {
    await initGoogleAuth()
  }
}

export async function signIn(): Promise<string> {
  if (isNative) {
    const user = await GoogleAuth.signIn()
    const authCode = user.serverAuthCode
    if (!authCode) throw new Error('serverAuthCode を取得できませんでした')

    // Web クライアントのシークレットで交換 → Web と同じ appDataFolder にアクセスできる
    const params = new URLSearchParams({
      code: authCode,
      client_id: WEB_CLIENT_ID,
      client_secret: WEB_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: '',
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const json = await res.json()
    if (!json.access_token) {
      throw new Error(`トークン交換失敗: ${json.error_description ?? JSON.stringify(json)}`)
    }
    setAccessToken(json.access_token)
    return json.access_token
  }
  return requestAccessToken()
}

export async function signInSilent(): Promise<string | null> {
  if (isNative) {
    try {
      const refreshed = await GoogleAuth.refresh()
      if (refreshed?.accessToken) {
        setAccessToken(refreshed.accessToken)
        return refreshed.accessToken
      }
    } catch { /* silent fail */ }
  }
  return null
}

export { WEB_CLIENT_ID }
