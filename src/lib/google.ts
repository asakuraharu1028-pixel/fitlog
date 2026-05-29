const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'fitlog-data.json'

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let accessToken: string | null = null

export function initGoogleAuth(): Promise<void> {
  return new Promise((resolve) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.access_token) {
          accessToken = response.access_token
        }
      },
    })
    resolve()
  })
}

export function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Token client not initialized'))
      return
    }
    // re-init with updated callback
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

async function driveRequest(path: string, options: RequestInit = {}) {
  if (!accessToken) throw new Error('Not authenticated')
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`)
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
    await driveRequest(`/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
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
