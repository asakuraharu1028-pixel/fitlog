import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { initGoogleAuth, requestAccessToken, setAccessToken } from './google'
import { callProxyNoAuth } from './recipeproxy'

export const isNative = Capacitor.isNativePlatform()

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
// drive.appdata: 記録データ / drive.file: マイドライブへの CSV 書き出し
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
]

// Android サインイン用クライアント（Android OAuth クライアント）
const ANDROID_CLIENT_ID = '685129420203-dufioist84icrt495iahbbqh67b76p6p.apps.googleusercontent.com'
// Web クライアントのシークレットはアプリに持たせない（画面の JS に入ると誰でも読めるため）。
// serverAuthCode のトークン交換は GAS 中継（gas/notion-proxy の exchangeAuthCode）が行う

export async function initAuth(): Promise<void> {
  if (isNative) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (GoogleAuth as any).initialize({
      clientId: ANDROID_CLIENT_ID,
      serverClientId: WEB_CLIENT_ID, // Web クライアントの serverAuthCode を要求
      scopes: DRIVE_SCOPES,
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

    // GAS 中継が Web クライアントのシークレットで交換 → Web と同じ appDataFolder にアクセスできる
    const res = await callProxyNoAuth<{ accessToken: string; expiresIn?: number }>({
      action: 'exchangeAuthCode',
      code: authCode,
      clientId: WEB_CLIENT_ID,
    })
    if (!res.ok) throw new Error(`トークン交換失敗: ${res.error}`)
    setAccessToken(res.data.accessToken)
    return res.data.accessToken
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
