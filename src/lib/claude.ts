const API_KEY_STORAGE = 'fitlog-claude-key'

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

const SYSTEM_PROMPT = `あなたは栄養士アシスタントです。
ユーザーが入力した食事内容や食事の画像から、食品ごとの栄養素を推定してください。
必ず以下のJSON配列形式のみで返答してください（説明文不要）:
[
  {
    "name": "食品名",
    "grams": 推定グラム数(数値),
    "calories": カロリー(kcal/推定グラム数分の整数),
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
栄養素は日本食品標準成分表を参考に推定グラム数に合わせた絶対量で返してください。`

async function callClaude(
  apiKey: string,
  messages: { role: 'user'; content: string | { type: string; source?: object; text?: string }[] }[]
): Promise<AiFoodResult[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `API error ${res.status}`)
  }
  const data = await res.json()
  const text: string = data.content[0].text
  const json = text.match(/\[[\s\S]*\]/)
  if (!json) throw new Error('AIからの応答を解析できませんでした')
  return JSON.parse(json[0]) as AiFoodResult[]
}

// テキストから食品を解析
export async function analyzeFoodText(text: string): Promise<AiFoodResult[]> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')
  return callClaude(apiKey, [
    { role: 'user', content: `以下の食事内容の栄養素を推定してください:\n${text}` },
  ])
}

// 画像から食品を解析
export async function analyzeFoodImage(base64: string, mediaType: string): Promise<AiFoodResult[]> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')
  return callClaude(apiKey, [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        { type: 'text', text: 'この食事の写真から食品と量を特定し、栄養素を推定してください。' },
      ],
    },
  ])
}
