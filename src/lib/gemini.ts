const API_KEY_STORAGE = 'fitlog-gemini-key'

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? ''
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE, key)
}

export interface AiFoodResult {
  name: string
  grams: number
  calories: number
  protein: number
  fat: number
  carbs: number
  fiber: number
  vitA: number
  vitC: number
  vitD: number
  ca: number
  fe: number
  na: number
}

const SYSTEM_PROMPT = `あなたは栄養士アシスタントです。食事内容や画像から食品ごとの栄養素を推定してください。
必ず以下のJSON配列のみで返答してください（説明文不要）:
[{"name":"食品名","grams":推定グラム数,"calories":kcal整数,"protein":タンパク質g,"fat":脂質g,"carbs":炭水化物g,"fiber":食物繊維g,"vitA":ビタミンAμgRAE整数,"vitC":ビタミンCmg整数,"vitD":ビタミンDμg,"ca":カルシウムmg整数,"fe":鉄mg,"na":ナトリウムmg整数}]
栄養素は日本食品標準成分表を参考に推定グラム数に合わせた絶対量で返してください。`

// APIキーの種類を判定してエンドポイントを切り替える
function isOpenRouterKey(key: string) {
  return key.startsWith('sk-or-')
}

async function callOpenRouter(apiKey: string, messages: object[]): Promise<AiFoodResult[]> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemma-4-31b-it:free',
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `APIエラー ${res.status}`)
  }
  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('AIからの応答を解析できませんでした')
  return JSON.parse(match[0]) as AiFoodResult[]
}

async function callGemini(apiKey: string, parts: object[]): Promise<AiFoodResult[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `APIエラー ${res.status}`)
  }
  const data = await res.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('AIからの応答を解析できませんでした')
  return JSON.parse(match[0]) as AiFoodResult[]
}

export async function analyzeFoodText(text: string): Promise<AiFoodResult[]> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')

  if (isOpenRouterKey(apiKey)) {
    return callOpenRouter(apiKey, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `以下の食事内容の栄養素を推定してください:\n${text}` },
    ])
  }
  return callGemini(apiKey, [
    { text: `${SYSTEM_PROMPT}\n\n以下の食事内容の栄養素を推定してください:\n${text}` },
  ])
}

export async function analyzeFoodImage(base64: string, mimeType: string): Promise<AiFoodResult[]> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')

  if (isOpenRouterKey(apiKey)) {
    return callOpenRouter(apiKey, [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: 'この食事の写真から食品と量を特定し、栄養素を推定してください。' },
        ],
      },
    ])
  }
  return callGemini(apiKey, [
    { inline_data: { mime_type: mimeType, data: base64 } },
    { text: `${SYSTEM_PROMPT}\nこの食事の写真から食品と量を特定し、栄養素を推定してください。` },
  ])
}
