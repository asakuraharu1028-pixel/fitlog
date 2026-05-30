import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { initGoogleAuth, requestAccessToken, setAccessToken } from './google'

export const isNative = Capacitor.isNativePlatform()

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

// Android Google Sign-In 用
const ANDROID_SIGN_IN_CLIENT_ID = '685129420203-9k3edai0b7kh28or4ummjpnourgh2g8u.apps.googleusercontent.com'

// Web クライアント（WebアプリのappDataFolderと共有するため同じクライアントを使用）
const DESKTOP_CLIENT_ID = WEB_CLIENT_ID
const DESKTOP_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string

export async function initAuth(): Promise<void> {
  if (isNative) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (GoogleAuth as any).initialize({
      clientId: ANDROID_SIGN_IN_CLIENT_ID,
      serverClientId: WEB_CLIENT_ID,
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

    // serverAuthCode を Desktop クライアントで Drive トークンに交換
    const authCode = user.serverAuthCode
    if (!authCode) throw new Error('serverAuthCode が取得できませんでした')

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: authCode,
        client_id: DESKTOP_CLIENT_ID,
        client_secret: DESKTOP_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: '', // Android ネイティブSDK経由のserverAuthCode交換は空文字
      }).toString(),
    })

    const json = await res.json()
    if (!json.access_token) {
      throw new Error(json.error_description ?? JSON.stringify(json))
    }

    // トークンのスコープを確認
    const tokenInfo = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${json.access_token}`
    ).then(r => r.json())
    console.log('Token scopes:', tokenInfo.scope)
    console.log('Token info:', JSON.stringify(tokenInfo))

    setAccessToken(json.access_token)
    return json.access_token
  }
  return requestAccessToken()
}

export async function signInSilent(): Promise<string | null> {
  if (isNative) {
    try {
      const user = await GoogleAuth.refresh()
      if (user?.accessToken) {
        setAccessToken(user.accessToken)
        return user.accessToken
      }
    } catch { /* silent fail */ }
  }
  return null
}

export { WEB_CLIENT_ID }
