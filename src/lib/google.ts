import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const ANDROID_CLIENT_ID = '685129420203-dufioist84icrt495iahbbqh67b76p6p.apps.googleusercontent.com'
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'fitlog-data.json'

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let accessToken: string | null = null

const isNative = Capacitor.isNativePlatform()

// ── Android (Native) ──────────────────────────────────────────
export async function initGoogleAuth(): Promise<void> {
  if (isNative) {
    await GoogleAuth.initialize({
      clientId: ANDROID_CLIENT_ID,
      scopes: [SCOPES],
      grantOfflineAccess: true,
    })
  }
}

export async function requestAccessToken(): Promise<string> {
  if (isNative) {
    const user = await GoogleAuth.signIn()
    const token = user.authentication.accessToken
    accessToken = token
    return token
  }

  // ── Web ──────────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: google.accounts.oauth2.TokenResponse) => {
        if ((response as { error?: string }).error) {
          reject(new Error((response as { error?: string }).error))
          return
        }
        accessToken = response.access_token
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token: string) {
  accessToken = token
}

// ── Drive API ─────────────────────────────────────────────────
async function driveRequest(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  if (!accessToken) throw new Error('Not authenticated')
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  })
  if (res.status === 401 && retry && !isNative) {
    // トークン期限切れ → 再取得してリトライ
    accessToken = null
    await requestAccessToken()
    return driveRequest(path, options, false)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Drive API error: ${res.status} - ${body}`)
  }
  return res
}

async function findDataFile(): Promise<string | null> {
  const res = await driveRequest(
    `/files?spaces=appDataFolder&q=name='${FILE_NAME}'&fields=files(id)`
  )
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

export async function loadFromDrive<T>(): Promise<T | null> {
  const fileId = await findDataFile()
  if (!fileId) return null
  const res = await driveRequest(`/files/${fileId}?alt=media`)
  return res.json()
}

export async function saveToDrive<T>(data: T): Promise<void> {
  const body = JSON.stringify(data)
  const fileId = await findDataFile()

  if (fileId) {
    // アップロード系は別ベース URL なので直接 fetch する
    if (!accessToken) throw new Error('Not authenticated')
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body,
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Drive update error: ${res.status} - ${text}`)
    }
  } else {
    const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })
    const form = new FormData()
    form.append('metadata', new Blob([meta], { type: 'application/json' }))
    form.append('file', new Blob([body], { type: 'application/json' }))
    if (!accessToken) throw new Error('Not authenticated')
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    )
    if (!res.ok) throw new Error(`Drive upload error: ${res.status}`)
  }
}
