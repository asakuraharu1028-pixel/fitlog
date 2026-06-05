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

export interface RecipeNutrition {
  calories: number
  protein: number
  fat: number
  carbs: number
  sodium: number  // 食塩相当量 g（1人前）
  parsedIngredients: { name: string; amount: string }[]
}

const INGREDIENT_PROMPT = `あなたは栄養士アシスタントです。レシピの材料リストから全材料の栄養素を推定し、合計値を返してください。
必ず以下のJSON形式のみで返答してください（説明文不要）:
{"totalCalories":合計kcal整数,"totalProtein":合計タンパク質g,"totalFat":合計脂質g,"totalCarbs":合計炭水化物g,"totalSodium":合計食塩相当量g,"items":[{"name":"食材名","amount":"量の表記","calories":kcal整数,"protein":タンパク質g,"fat":脂質g,"carbs":炭水化物g}]}
- 各栄養素は日本食品標準成分表を参考に実際の量に合わせた絶対量で推定する
- 「大さじ1」「1個」などの単位も適切にグラム換算して計算する
- totalSodiumはしょうゆ・味噌・塩・めんつゆなどの調味料も含めた食塩相当量の合計（g）を返す`

export async function analyzeRecipeIngredients(
  ingredientsText: string,
  servings: number
): Promise<RecipeNutrition> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')

  const prompt = `${INGREDIENT_PROMPT}\n\n以下の材料リスト（${servings}人前）の栄養素合計を推定してください:\n${ingredientsText}`

  let text: string

  if (isOpenRouterKey(apiKey)) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemma-4-31b-it:free',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: { message?: string } }).error?.message ?? `APIエラー ${res.status}`)
    }
    const data = await res.json()
    text = data.choices?.[0]?.message?.content ?? ''
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: { message?: string } }).error?.message ?? `APIエラー ${res.status}`)
    }
    const data = await res.json()
    text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AIからの応答を解析できませんでした')

  const parsed = JSON.parse(match[0]) as {
    totalCalories: number
    totalProtein: number
    totalFat: number
    totalCarbs: number
    totalSodium?: number
    items: { name: string; amount: string }[]
  }

  const perServing = (v: number) => Math.round((v / servings) * 10) / 10

  return {
    calories:          Math.round(parsed.totalCalories / servings),
    protein:           perServing(parsed.totalProtein),
    fat:               perServing(parsed.totalFat),
    carbs:             perServing(parsed.totalCarbs),
    sodium:            perServing(parsed.totalSodium ?? 0),
    parsedIngredients: (parsed.items ?? []).map(i => ({ name: i.name, amount: i.amount })),
  }
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

const LABEL_PROMPT = `あなたは栄養士アシスタントです。食品パッケージの栄養成分表示ラベルまたは商品画像から情報を読み取ってください。
必ず以下のJSON（配列ではなくオブジェクト1つ）のみで返答してください（説明文不要）:
{"name":"商品名","grams":1食分のグラム数,"calories":kcal整数,"protein":タンパク質g,"fat":脂質g,"carbs":炭水化物g,"fiber":食物繊維g,"vitA":0,"vitC":0,"vitD":0,"ca":カルシウムmg整数,"fe":鉄mg,"na":ナトリウムmg整数}
- gramsはラベルの「1食分の量」や「内容量」を使う（不明なら100）
- 栄養素はgramsに対応した絶対量で返す（100g当たりの値ならgrams/100を乗算する）
- 商品名が読み取れない場合は"不明な商品"とする`

export async function analyzeFoodLabel(base64: string, mimeType: string): Promise<AiFoodResult> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')

  let text: string
  if (isOpenRouterKey(apiKey)) {
    const data = await callOpenRouter(apiKey, [
      { role: 'system', content: LABEL_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: 'この商品の栄養成分表示から情報を読み取ってください。' },
        ],
      },
    ])
    return data[0]
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: `${LABEL_PROMPT}\nこの商品の栄養成分表示から情報を読み取ってください。` },
        ],
      }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `APIエラー ${res.status}`)
  }
  const data = await res.json()
  text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AIからの応答を解析できませんでした')
  return JSON.parse(match[0]) as AiFoodResult
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
