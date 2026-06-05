import { getApiKey } from './gemini'
import { loadFileFromDrive, saveFileToDrive } from './google'
import type { WeeklyMealPlan, DayMealPlan, Recipe, RecipeCategory } from '../types'
import { nanoid } from 'nanoid'

const MEALPLAN_FILE = 'mealplan.json'

export async function loadSavedMealPlan(): Promise<WeeklyMealPlan | null> {
  try {
    return await loadFileFromDrive<WeeklyMealPlan>(MEALPLAN_FILE)
  } catch {
    return null
  }
}

export async function saveMealPlan(plan: WeeklyMealPlan): Promise<void> {
  await saveFileToDrive(MEALPLAN_FILE, plan)
}

function isOpenRouterKey(key: string) {
  return key.startsWith('sk-or-')
}

const DAY_LABELS = ['1日目（月）', '2日目（火）', '3日目（水）', '4日目（木）', '5日目（金）', '6日目（土）', '7日目（日）']

const CATEGORY_JP: Record<RecipeCategory, string> = {
  main: '主菜', side: '副菜', soup: '汁物', staple: '主食', breakfast: '朝食向け', snack: '間食', bento: '弁当',
}

function buildRecipeSection(recipes: Recipe[]): string {
  if (recipes.length === 0) return ''

  const byCategory: Partial<Record<RecipeCategory, Recipe[]>> = {}
  for (const r of recipes) {
    ;(byCategory[r.category] ??= []).push(r)
  }

  const lines: string[] = ['【登録済みレシピDB（できる限りこの中から選んでください）】']
  for (const [cat, list] of Object.entries(byCategory) as [RecipeCategory, Recipe[]][]) {
    lines.push(`■ ${CATEGORY_JP[cat]}`)
    for (const r of list) {
      const sodium = r.sodium != null ? ` 塩${r.sodium}g` : ''
      const url = r.sourceUrl ? ` url:${r.sourceUrl}` : ''
      lines.push(`  - ${r.name}：${r.calories}kcal P${r.protein}g F${r.fat}g C${r.carbs}g${sodium}${url}`)
    }
  }
  lines.push('')
  lines.push('※ DBにないカテゴリや料理が必要な場合のみ、自由に補完してください。')
  lines.push('※ 各レシピのPFC・塩分値はDB登録値をそのままJSONに使ってください（自分で計算しない）。')
  return '\n\n' + lines.join('\n')
}

export interface BentoSettings {
  days: number[]      // 0=月, 1=火, ..., 6=日
  recipe: Recipe | null
}

function buildBentoSection(settings: BentoSettings): string {
  if (settings.days.length === 0) return ''

  const dayNames = ['月', '火', '水', '木', '金', '土', '日']
  const targetDays = settings.days
    .map(d => `${d + 1}日目（${dayNames[d]}）`)
    .join('、')

  const lines = ['', '【弁当指定】']
  if (settings.recipe) {
    const r = settings.recipe
    const sodium = r.sodium != null ? ` 塩${r.sodium}g` : ''
    lines.push(`- ${targetDays} の昼食は弁当「${r.name}」に固定する`)
    lines.push(`  栄養値: ${r.calories}kcal P${r.protein}g F${r.fat}g C${r.carbs}g${sodium}（DB登録値をそのままJSONに使うこと）`)
  } else {
    lines.push(`- ${targetDays} の昼食は弁当とする（弁当らしい献立をAIが提案）`)
  }
  lines.push('- 弁当指定日は7日間すべて同じ弁当内容にする')
  lines.push('- 弁当以外の曜日の昼食は通常通り提案する')
  return lines.join('\n')
}

function buildPrompt(goalCalories: number, recipes: Recipe[], bento?: BentoSettings): string {
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
- レシピURLはDBの各レシピに url: で記載されている場合はその値をそのまま使用。url: がない場合は https://oishi-kenko.com/recipes?q=料理名 の形式で記載
- 栄養バランス（P:F:C = 15-20% : 20-25% : 55-65%）を意識する
- 食塩相当量は1日6.5g未満を目安にする（汁物・漬物・加工食品の塩分に注意）
- 朝食は7日間で2～3パターンに絞り、同じ献立を繰り返してよい（毎日違う朝食にしない）
- 夕食の主菜・副菜は週3～4種類に絞り、複数日で同じレシピを繰り返す
- 買い物リストの食材総数が70品目以内に収まるよう食材の使い回しを最優先で意識する（同じ食材を複数料理に活用する）${buildRecipeSection(recipes)}${bento ? buildBentoSection(bento) : ''}

必ず以下のJSON形式のみで返答してください（コードブロック・説明文不要）:
{"days":[{"dayLabel":"1日目（月）","totalCalories":${goalCalories},"breakfast":[{"name":"食品名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"sodium":数値,"searchUrl":"URL or null"}],"lunch":[{"name":"食品名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"sodium":数値,"searchUrl":"URL or null"}],"dinner":{"main":{"name":"主菜名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"sodium":数値,"searchUrl":"URL or null"},"staple":{"name":"主食名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"sodium":数値,"searchUrl":null},"sides":[{"name":"副菜名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"sodium":数値,"searchUrl":"URL or null"}],"soup":{"name":"汁物名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"sodium":数値,"searchUrl":"URL or null"}},"snack":[{"name":"間食名","calories":数値,"protein":数値,"fat":数値,"carbs":数値,"sodium":数値,"searchUrl":null,"note":"補足 or null"}]},...7日分]}
sodiumは食塩相当量（g）で記載すること。
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

export async function generateWeeklyMealPlan(
  goalCalories: number,
  recipes: Recipe[] = [],
  bento?: BentoSettings
): Promise<WeeklyMealPlan> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('APIキーが設定されていません')

  const prompt = buildPrompt(goalCalories, recipes, bento)
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
  await saveMealPlan(plan)
  return plan
}
