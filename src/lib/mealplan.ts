import { getApiKey } from './gemini'
import type { WeeklyMealPlan, DayMealPlan } from '../types'
import { nanoid } from 'nanoid'

const MEALPLAN_STORAGE_KEY = 'fitlog-mealplan'

export function loadSavedMealPlan(): WeeklyMealPlan | null {
  try {
    const raw = localStorage.getItem(MEALPLAN_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as WeeklyMealPlan) : null
  } catch {
    return null
  }
}

export function saveMealPlan(plan: WeeklyMealPlan) {
  localStorage.setItem(MEALPLAN_STORAGE_KEY, JSON.stringify(plan))
}

function isOpenRouterKey(key: string) {
  return key.startsWith('sk-or-')
}

const DAY_LABELS = ['1日目（月）', '2日目（火）', '3日目（水）', '4日目（木）', '5日目（金）', '6日目（土）', '7日目（日）']

function buildPrompt(goalCalories: number): string {
  const breakfastCal = Math.round(goalCalories * 0.27)
  const lunchCal    = Math.round(goalCalories * 0.23)
  const dinnerCal   = Math.round(goalCalories * 0.35)
  const snackCal    = Math.round(goalCalories * 0.15)

  return `あなたは管理栄養士です。目標摂取カロリー ${goalCalories}kcal/日 に合わせた7日間の献立を作成してください。

【条件】
- 食事スタイル: 日本人の一般的な家庭料理
- カロリー配分目安: 朝食 ${breakfastCal}kcal、昼食 ${lunchCal}kcal、夕食 ${dinnerCal}kcal、間食 ${snackCal}kcal
- プロテインサプリメントは1日最大30gまで（間食に組み込み可）
- 夕食の構成: 主菜・主食・副菜(1〜2種)・汁物（省略・変更も可）
- レシピ検索URLは cookpad.com の検索URL形式で記載（例: https://cookpad.com/search/鶏照り焼き）
- 7日間で食材・料理が偏らないよう多様な献立にする
- 栄養バランス（P:F:C = 15-20% : 20-25% : 55-65%）を意識する

必ず以下のJSON形式のみで返答してください（コードブロック・説明文不要）:
{"days":[{"dayLabel":"1日目（月）","totalCalories":${goalCalories},"breakfast":[{"name":"食品名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"searchUrl":"URL or null"}],"lunch":[{"name":"食品名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"searchUrl":"URL or null"}],"dinner":{"main":{"name":"主菜名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"searchUrl":"URL or null"},"staple":{"name":"主食名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"searchUrl":null},"sides":[{"name":"副菜名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"searchUrl":"URL or null"}],"soup":{"name":"汁物名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"searchUrl":"URL or null"}},"snack":[{"name":"間食名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"searchUrl":null,"note":"補足 or null"}]},...7日分]}
dayLabelは${DAY_LABELS.map((l, i) => `${i + 1}日目は"${l}"`).join('、')}とする。`
}

async function callGemini(apiKey: string, prompt: string): Promise<DayMealPlan[]> {
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
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AIからの応答を解析できませんでした')
  const parsed = JSON.parse(match[0]) as { days: DayMealPlan[] }
  return parsed.days
}

async function callOpenRouter(apiKey: string, prompt: string): Promise<DayMealPlan[]> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemma-4-31b-it:free',
      messages: [
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `APIエラー ${res.status}`)
  }
  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AIからの応答を解析できませんでした')
  const parsed = JSON.parse(match[0]) as { days: DayMealPlan[] }
  return parsed.days
}

export async function generateWeeklyMealPlan(goalCalories: number): Promise<WeeklyMealPlan> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')

  const prompt = buildPrompt(goalCalories)
  const days = isOpenRouterKey(apiKey)
    ? await callOpenRouter(apiKey, prompt)
    : await callGemini(apiKey, prompt)

  if (!Array.isArray(days) || days.length === 0) throw new Error('献立データを取得できませんでした')

  const plan: WeeklyMealPlan = {
    id: nanoid(),
    createdAt: new Date().toISOString(),
    goalCalories,
    days,
  }
  saveMealPlan(plan)
  return plan
}
