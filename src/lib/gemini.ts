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

const PROMPT_SUFFIX = `
食品ごとに以下のJSON配列形式のみで返答してください（説明文・マークダウン不要）:
[
  {
    "name": "食品名",
    "grams": 推定グラム数(数値),
    "calories": カロリーkcal(整数),
    "protein": タンパク質g(小数点1桁),
    "fat": 脂質g(小数点1桁),
    "carbs": 炭水化物g(小数点1桁),
    "fiber": 食物繊維g(小数点1桁),
    "vitA": ビタミンAμgRAE(整数),
    "vitC": ビタミンCmg(整数),
    "vitD": ビタミンDμg(小数点1桁),
    "ca": カルシウムmg(整数),
    "fe": 鉄mg(小数点1桁),
    "na": ナトリウムmg(整数)
  }
]
栄養素は日本食品標準成分表を参考に、推定グラム数に合わせた絶対量で返してください。`

async function callGemini(apiKey: string, parts: object[]): Promise<AiFoodResult[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as { error?: { message?: string } }).error?.message ?? `APIエラー ${res.status}`
    throw new Error(msg)
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
  return callGemini(apiKey, [
    { text: `以下の食事内容の栄養素を推定してください:\n${text}${PROMPT_SUFFIX}` },
  ])
}

export async function analyzeFoodImage(base64: string, mimeType: string): Promise<AiFoodResult[]> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')
  return callGemini(apiKey, [
    { inline_data: { mime_type: mimeType, data: base64 } },
    { text: `この食事の写真から食品と量を特定し、栄養素を推定してください。${PROMPT_SUFFIX}` },
  ])
}
