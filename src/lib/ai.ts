// AI 呼び出しの共通クライアント。
// Gemini を優先し、失敗したら（エラー・上限超過・応答が解析できない等）OpenRouter に自動で切り替える。

export type AiProvider = 'gemini' | 'openrouter'

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const DEFAULT_OPENROUTER_MODEL = 'google/gemma-4-31b-it:free'

const STORAGE = {
  geminiKey:       'fitlog-gemini-key', // 旧バージョンでは OpenRouter キーもここに保存していた
  openRouterKey:   'fitlog-openrouter-key',
  geminiModel:     'fitlog-gemini-model',
  openRouterModel: 'fitlog-openrouter-model',
}

export interface AiConfig {
  geminiKey: string
  openRouterKey: string
  geminiModel: string
  openRouterModel: string
}

function read(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // ストレージが使えない環境では保存しない
  }
}

/** 旧バージョンで Gemini 欄に保存された OpenRouter キー（sk-or-）を OpenRouter 欄へ移す */
function migrateLegacyKey() {
  const legacy = read(STORAGE.geminiKey)
  if (!legacy.startsWith('sk-or-')) return
  if (!read(STORAGE.openRouterKey)) write(STORAGE.openRouterKey, legacy)
  write(STORAGE.geminiKey, '')
}

export function getAiConfig(): AiConfig {
  migrateLegacyKey()
  return {
    geminiKey:       read(STORAGE.geminiKey).trim(),
    openRouterKey:   read(STORAGE.openRouterKey).trim(),
    geminiModel:     read(STORAGE.geminiModel).trim() || DEFAULT_GEMINI_MODEL,
    openRouterModel: read(STORAGE.openRouterModel).trim() || DEFAULT_OPENROUTER_MODEL,
  }
}

export function saveAiConfig(config: AiConfig) {
  write(STORAGE.geminiKey,       config.geminiKey.trim())
  write(STORAGE.openRouterKey,   config.openRouterKey.trim())
  // デフォルトと同じなら保存しない（将来デフォルトを変えたときに追従させるため）
  const gm = config.geminiModel.trim()
  const om = config.openRouterModel.trim()
  write(STORAGE.geminiModel,     gm === DEFAULT_GEMINI_MODEL ? '' : gm)
  write(STORAGE.openRouterModel, om === DEFAULT_OPENROUTER_MODEL ? '' : om)
}

/** どちらかの API キーが設定されていれば true */
export function hasAiKey(): boolean {
  const c = getAiConfig()
  return !!(c.geminiKey || c.openRouterKey)
}

export interface AiRequest {
  /** システムプロンプト（口調・出力形式の指示） */
  system?: string
  prompt: string
  image?: { base64: string; mimeType: string }
  /** JSON での出力を求める（Gemini の JSON モードを使う） */
  json?: boolean
}

function errorMessage(err: unknown, status: number): string {
  return (err as { error?: { message?: string } })?.error?.message ?? `APIエラー ${status}`
}

async function callGemini(key: string, model: string, req: AiRequest): Promise<string> {
  const parts: object[] = []
  if (req.image) parts.push({ inline_data: { mime_type: req.image.mimeType, data: req.image.base64 } })
  parts.push({ text: req.prompt })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(req.system ? { system_instruction: { parts: [{ text: req.system }] } } : {}),
      contents: [{ parts }],
      ...(req.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }),
  })
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), res.status))
  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
}

async function callOpenRouter(key: string, model: string, req: AiRequest): Promise<string> {
  const messages: object[] = []
  if (req.system) messages.push({ role: 'system', content: req.system })
  messages.push({
    role: 'user',
    content: req.image
      ? [
          { type: 'image_url', image_url: { url: `data:${req.image.mimeType};base64,${req.image.base64}` } },
          { type: 'text', text: req.prompt },
        ]
      : req.prompt,
  })

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  })
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), res.status))
  const data = await res.json()
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

const PROVIDER_LABEL: Record<AiProvider, string> = { gemini: 'Gemini', openrouter: 'OpenRouter' }

/** 指定したプロバイダーだけで呼び出す（接続テスト用） */
export async function callProvider(provider: AiProvider, req: AiRequest): Promise<string> {
  const c = getAiConfig()
  if (provider === 'gemini') {
    if (!c.geminiKey) throw new Error('Gemini のAPIキーが設定されていません')
    return callGemini(c.geminiKey, c.geminiModel, req)
  }
  if (!c.openRouterKey) throw new Error('OpenRouter のAPIキーが設定されていません')
  return callOpenRouter(c.openRouterKey, c.openRouterModel, req)
}

/**
 * AI を呼び出し、応答を parse で変換して返す。
 * Gemini → OpenRouter の順に試し、通信エラー・API エラー・parse の失敗のいずれでも次へ切り替える。
 */
export async function callAi<T>(req: AiRequest, parse: (text: string) => T): Promise<T> {
  const c = getAiConfig()
  const providers = ([
    c.geminiKey     ? 'gemini'     : null,
    c.openRouterKey ? 'openrouter' : null,
  ] as const).filter((p): p is AiProvider => p !== null)
  if (providers.length === 0) throw new Error('APIキーが設定されていません')

  const errors: string[] = []
  for (const provider of providers) {
    try {
      const text = await callProvider(provider, req)
      if (!text) throw new Error('AIから空の応答が返りました')
      return parse(text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`${PROVIDER_LABEL[provider]} failed:`, msg)
      errors.push(`${PROVIDER_LABEL[provider]}: ${msg}`)
    }
  }
  throw new Error(errors.join(' / '))
}

/** テキストの応答をそのまま返す */
export function generateText(req: AiRequest): Promise<string> {
  return callAi(req, text => text)
}

/** 応答から JSON（配列またはオブジェクト）を取り出して返す */
export function generateJson<T>(req: AiRequest, shape: 'array' | 'object'): Promise<T> {
  return callAi({ ...req, json: true }, text => {
    const match = text.match(shape === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/)
    if (!match) throw new Error('AIからの応答を解析できませんでした')
    return JSON.parse(match[0]) as T
  })
}

/** 利用可能なモデル一覧を取得する（設定画面の候補表示用） */
export async function listModels(provider: AiProvider, key: string): Promise<string[]> {
  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${key}`)
    if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), res.status))
    const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    return (data.models ?? [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(name => name.startsWith('gemini'))
      .sort()
  }
  // OpenRouter は無料・画像入力対応のモデルに絞る（キー不要）
  const res = await fetch('https://openrouter.ai/api/v1/models')
  if (!res.ok) throw new Error(`APIエラー ${res.status}`)
  const data = await res.json() as { data?: { id: string; architecture?: { input_modalities?: string[] } }[] }
  return (data.data ?? [])
    .filter(m => m.id.endsWith(':free') && m.architecture?.input_modalities?.includes('image'))
    .map(m => m.id)
    .sort()
}
