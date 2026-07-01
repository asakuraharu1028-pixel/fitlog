import { Capacitor } from '@capacitor/core'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'fitlog-data.json'

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let accessToken: string | null = null

const isNative = Capacitor.isNativePlatform()

// ── Android (Native) ──────────────────────────────────────────
export async function initGoogleAuth(): Promise<void> {
  if (isNative) {
    await GoogleAuth.initialize({
      clientId: CLIENT_ID, // Web クライアントID（Android は google-services.json が処理）
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

// ── 汎用ファイル操作 ─────────────────────────────────────────
async function findFile(name: string): Promise<string | null> {
  const res = await driveRequest(
    `/files?spaces=appDataFolder&q=name='${name}'&fields=files(id)`
  )
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

export async function loadFileFromDrive<T>(name: string): Promise<T | null> {
  const fileId = await findFile(name)
  if (!fileId) return null
  const res = await driveRequest(`/files/${fileId}?alt=media`)
  return res.json()
}

export async function saveFileToDrive<T>(name: string, data: T): Promise<void> {
  const body = JSON.stringify(data)
  const fileId = await findFile(name)
  if (fileId) {
    if (!accessToken) throw new Error('Not authenticated')
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body,
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Drive update error: ${res.status} - ${text}`)
    }
  } else {
    const meta = JSON.stringify({ name, parents: ['appDataFolder'] })
    const form = new FormData()
    form.append('metadata', new Blob([meta], { type: 'application/json' }))
    form.append('file', new Blob([body], { type: 'application/json' }))
    if (!accessToken) throw new Error('Not authenticated')
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
    )
    if (!res.ok) throw new Error(`Drive upload error: ${res.status}`)
  }
}

// ── 画像などバイナリファイル ─────────────────────────────────
// base64文字列を appDataFolder に新規アップロードし、ファイルIDを返す
export async function uploadImageToDrive(base64: string, mimeType: string): Promise<string> {
  if (!accessToken) throw new Error('Not authenticated')
  // base64 → Blob
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })

  const ext = mimeType.split('/')[1] || 'jpg'
  const meta = JSON.stringify({ name: `recipe-img-${crypto.randomUUID()}.${ext}`, parents: ['appDataFolder'] })
  const form = new FormData()
  form.append('metadata', new Blob([meta], { type: 'application/json' }))
  form.append('file', blob)
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive image upload error: ${res.status} - ${text}`)
  }
  const data = await res.json()
  return data.id as string
}

// ファイルID のバイナリを取得して表示用の Blob URL を返す
export async function loadImageUrlFromDrive(fileId: string): Promise<string> {
  const res = await driveRequest(`/files/${fileId}?alt=media`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

// ファイルを削除する（レシピ削除・画像差し替え時）
export async function deleteFileFromDrive(fileId: string): Promise<void> {
  await driveRequest(`/files/${fileId}`, { method: 'DELETE' })
}

// ── fitlog-data.json（既存） ──────────────────────────────────
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
