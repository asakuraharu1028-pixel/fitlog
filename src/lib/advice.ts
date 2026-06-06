import { getApiKey } from './gemini'
import { localDateStr } from './utils'
import { getCharacter } from './characters'
import { useRecipeStore } from './recipedb'
import type { MealLog, CardioLog, StrengthLog, AppData } from '../types'

function isOpenRouterKey(key: string) {
  return key.startsWith('sk-or-')
}

function getSystemPrompt(data: AppData): string {
  return getCharacter(data.settings.advisorCharacter).systemPrompt
}

async function callAI(prompt: string, data: AppData, systemPromptOverride?: string): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''
  const systemPrompt = systemPromptOverride ?? getSystemPrompt(data)

  if (isOpenRouterKey(apiKey)) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemma-4-26b-a4b-it:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`OpenRouter エラー ${res.status}: ${err?.error?.message ?? res.statusText}`)
    }
    const d = await res.json()
    return (d.choices?.[0]?.message?.content ?? '').trim()
  }

  // Gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: prompt }] }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gemini エラー ${res.status}: ${err?.error?.message ?? res.statusText}`)
  }
  const d = await res.json()
  return (d.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
}

function stepsToCalories(steps: number, weightKg?: number): number {
  return Math.round(steps * (weightKg ?? 70) * 0.0005)
}

function todayCalorieSummary(data: AppData, goalCalories: number) {
  const today = localDateStr()
  const intake = data.mealLogs
    .filter(m => m.date === today)
    .reduce((s, m) => s + m.entries.reduce((a, e) => a + e.calories, 0), 0)
  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight
  const steps = (data.stepLogs ?? []).find(s => s.date === today)?.steps ?? 0
  const stepCalories = stepsToCalories(steps, weightKg)
  const burned = [
    ...data.cardioLogs.filter(c => c.date === today).map(c => c.caloriesBurned),
    ...data.strengthLogs.filter(s => s.date === today).map(s => s.estimatedCalories ?? 0),
    stepCalories,
  ].reduce((a, b) => a + b, 0)
  return { intake, burned, remaining: goalCalories - intake + burned, steps, stepCalories }
}

function stepsLine(steps: number, stepCalories?: number) {
  if (steps <= 0) return ''
  const calPart = stepCalories != null && stepCalories > 0 ? `（約${stepCalories}kcal消費）` : ''
  return `歩数: ${steps.toLocaleString()}歩${calPart}`
}

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食',
}
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const
type MealTypeKey = typeof MEAL_ORDER[number]

export async function getMealAdvice(meal: MealLog, data: AppData): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const goal = data.settings.goalCalories ?? 2000
  const { intake, burned, remaining, steps, stepCalories } = todayCalorieSummary(data, goal)
  const todayLogs = data.mealLogs.filter(m => m.date === meal.date)
  const registeredTypes = todayLogs.map(m => m.mealType as MealTypeKey)
  const totalProtein = todayLogs.flatMap(m => m.entries).reduce((s, e) => s + e.protein, 0)

  const mealNames = meal.entries.map(e => `${e.foodName}(${e.calories}kcal)`).join('、')
  const mealType = MEAL_TYPE_LABEL[meal.mealType] ?? meal.mealType

  // 登録済み食事の一覧
  const registeredSummary = todayLogs
    .map(m => `${MEAL_TYPE_LABEL[m.mealType] ?? m.mealType}: ${m.entries.map(e => e.foodName).join('・')}（${m.entries.reduce((s, e) => s + e.calories, 0)}kcal）`)
    .join('\n')

  // まだ記録されていない食事
  const unregistered = MEAL_ORDER
    .filter(t => t !== 'snack' && !registeredTypes.includes(t))
    .map(t => MEAL_TYPE_LABEL[t])

  const remainingMealsLine = unregistered.length > 0
    ? `まだ記録されていない食事：${unregistered.join('・')}`
    : '今日の食事はすべて記録済みです。'

  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight
  const proteinLow  = weightKg ? Math.round(weightKg * 1.6) : null
  const proteinHigh = weightKg ? Math.round(weightKg * 2.0) : null
  const fatLow      = Math.round(goal * 0.20 / 9)
  const fatHigh     = Math.round(goal * 0.30 / 9)
  const carbsLow    = Math.round(goal * 0.50 / 4)
  const carbsHigh   = Math.round(goal * 0.60 / 4)
  const pfcTargetLine = proteinLow != null
    ? `PFC目標レンジ: タンパク質${proteinLow}〜${proteinHigh}g / 脂質${fatLow}〜${fatHigh}g / 炭水化物${carbsLow}〜${carbsHigh}g`
    : `PFC目標レンジ: 脂質${fatLow}〜${fatHigh}g / 炭水化物${carbsLow}〜${carbsHigh}g`

  const sl = stepsLine(steps, stepCalories)
  const prompt = `
${mealType}に「${mealNames}」を記録しました。
今日の登録済み食事：
${registeredSummary}
${remainingMealsLine}
今日の状況：摂取${intake}kcal / 目標${goal}kcal / 消費${burned}kcal / 残り${remaining}kcal${sl ? ` / ${sl}` : ''}
今日のタンパク質合計：${totalProtein.toFixed(1)}g
${pfcTargetLine}
この食事内容と今日の栄養バランスを踏まえ、次の食事や生活習慣についてアドバイスをしてください。`

  return callAI(prompt, data)
}

export async function getMealSuggestion(data: AppData): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const today = localDateStr()
  const goal = data.settings.goalCalories ?? 2000
  const { intake, burned, remaining, steps: todaySteps, stepCalories: todayStepCalories } = todayCalorieSummary(data, goal)
  const todayLogs = data.mealLogs.filter(m => m.date === today)
  const registeredTypes = todayLogs.map(m => m.mealType as MealTypeKey)

  const unregistered = MEAL_ORDER
    .filter(t => t !== 'snack' && !registeredTypes.includes(t))
    .map(t => MEAL_TYPE_LABEL[t])

  if (unregistered.length === 0) return ''

  const allEntries   = todayLogs.flatMap(m => m.entries)
  const totalProtein = allEntries.reduce((s, e) => s + e.protein, 0)
  const totalFat     = allEntries.reduce((s, e) => s + e.fat, 0)
  const totalCarbs   = allEntries.reduce((s, e) => s + e.carbs, 0)
  const totalSaltG   = allEntries.reduce((s, e) => s + (e.sodium ?? 0), 0) * 2.54 / 1000

  const registeredSummary = todayLogs.length > 0
    ? todayLogs.map(m => `${MEAL_TYPE_LABEL[m.mealType] ?? m.mealType}: ${m.entries.map(e => e.foodName).join('・')}（${m.entries.reduce((s, e) => s + e.calories, 0)}kcal）`).join('\n')
    : 'なし'

  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight
  const weightLine = weightKg ? `体重：${weightKg}kg` : ''

  // レシピDBからレシピ一覧を取得
  const recipes = useRecipeStore.getState().db.recipes
  const recipeListLine = recipes.length > 0
    ? `\n【登録済みレシピDB（優先して使うこと）】\n${recipes.map(r => `・${r.name}（${r.calories}kcal, P:${r.protein}g F:${r.fat}g C:${r.carbs}g${r.sodium != null ? ` 塩:${r.sodium}g` : ''}）`).join('\n')}`
    : ''

  const sl = stepsLine(todaySteps, todayStepCalories)
  const prompt = `
今日の食事記録：
${registeredSummary}
残りの未記録食事：${unregistered.join('・')}
今日の状況：摂取済み${intake}kcal / 目標${goal}kcal / 消費${burned}kcal / 残り摂取可能${remaining}kcal${sl ? ` / ${sl}` : ''}
摂取済みPFC：P${totalProtein.toFixed(1)}g / F${totalFat.toFixed(1)}g / C${totalCarbs.toFixed(1)}g
摂取済み塩分相当量：${totalSaltG.toFixed(1)}g（目標上限：男性7.5g・女性6.5g）${weightLine ? `\n${weightLine}` : ''}${recipeListLine}
残りの${unregistered.join('・')}について、カロリーと栄養バランスを考慮した具体的な献立を提案してください。各食事の食品名と目安量を簡潔に箇条書きで示してください。`

  const suggestionSystemPrompt = `あなたは栄養士です。ユーザーの食事記録とカロリー・PFC・塩分バランスを元に、残りの食事の具体的な献立を提案します。アドバイスや感想は不要です。食事ごとに食品名と目安量（g）を箇条書きで簡潔に示してください。塩分が多い場合は薄味の料理を優先してください。登録済みレシピDBが提供されている場合は、そのレシピを優先的に提案に活用してください。`
  return callAI(prompt, data, suggestionSystemPrompt)
}

export async function getCardioAdvice(log: CardioLog, data: AppData): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const goal = data.settings.goalCalories ?? 2000
  const { intake, burned, steps, stepCalories } = todayCalorieSummary(data, goal)
  const weight = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight
  const sl = stepsLine(steps, stepCalories)

  const prompt = `
有酸素運動「${log.name}」を${log.durationMin}分行い、${log.caloriesBurned}kcal消費しました。
今日の摂取：${intake}kcal / 消費合計：${burned}kcal${sl ? ` / ${sl}` : ''}${weight ? ` / 体重：${weight}kg` : ''}
この運動内容に対するアドバイスや、次回へのアドバイスをしてください。`

  return callAI(prompt, data)
}

export async function getStrengthAdvice(log: StrengthLog, data: AppData): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const setsStr = log.sets.map((s, i) => `${i + 1}セット目: ${s.weight}kg × ${s.reps}回`).join(', ')

  const prompt = `
筋トレ「${log.name}」を行いました。${setsStr}
推定消費：${log.estimatedCalories ?? 0}kcal
このトレーニング内容に対するフォームや改善点、次回へのアドバイスをしてください。`

  return callAI(prompt, data)
}

// ── 日次・週次アドバイス ──────────────────────────────────────

function dayStats(data: AppData, date: string) {
  const meals = data.mealLogs.filter(m => m.date === date)
  const entries = meals.flatMap(m => m.entries)
  const calories = entries.reduce((s, e) => s + e.calories, 0)
  const protein  = entries.reduce((s, e) => s + e.protein, 0)
  const fat      = entries.reduce((s, e) => s + e.fat, 0)
  const carbs    = entries.reduce((s, e) => s + e.carbs, 0)
  const sodium   = entries.reduce((s, e) => s + (e.sodium ?? 0), 0)
  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight
  const steps    = (data.stepLogs ?? []).find(s => s.date === date)?.steps ?? 0
  const burned   = data.cardioLogs.filter(c => c.date === date).reduce((s, c) => s + c.caloriesBurned, 0)
    + data.strengthLogs.filter(s => s.date === date).reduce((s, t) => s + (t.estimatedCalories ?? 0), 0)
    + stepsToCalories(steps, weightKg)
  const sleep    = (data.sleepLogs ?? []).filter(s => s.date === date).reduce((s, r) => s + r.durationMin, 0)
  return { calories, protein, fat, carbs, sodium, burned, sleep, steps }
}

export async function getDailyAdvice(data: AppData): Promise<string> {
  if (!getApiKey()) return ''
  const today = localDateStr()
  const s = dayStats(data, today)
  const goal = data.settings.goalCalories ?? 2000
  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight
  const proteinLow  = weightKg ? Math.round(weightKg * 1.6) : null
  const proteinHigh = weightKg ? Math.round(weightKg * 2.0) : null
  const fatLow      = Math.round(goal * 0.20 / 9)
  const fatHigh     = Math.round(goal * 0.30 / 9)
  const carbsLow    = Math.round(goal * 0.50 / 4)
  const carbsHigh   = Math.round(goal * 0.60 / 4)
  const pfcTargetLine = proteinLow != null
    ? `PFC目標レンジ: タンパク質${proteinLow}〜${proteinHigh}g / 脂質${fatLow}〜${fatHigh}g / 炭水化物${carbsLow}〜${carbsHigh}g`
    : `PFC目標レンジ: 脂質${fatLow}〜${fatHigh}g / 炭水化物${carbsLow}〜${carbsHigh}g`

  const prompt = `今日（${today}）の健康データを総括してください。
摂取カロリー: ${s.calories}kcal（目標: ${goal}kcal）
PFC実績: タンパク質${s.protein.toFixed(1)}g / 脂質${s.fat.toFixed(1)}g / 炭水化物${s.carbs.toFixed(1)}g
${pfcTargetLine}
塩分相当量: ${(s.sodium * 2.54 / 1000).toFixed(1)}g（目安: 男性7.5g未満、女性6.5g未満）
消費カロリー: ${s.burned}kcal${s.steps > 0 ? `\n歩数: ${s.steps.toLocaleString()}歩` : ''}
睡眠: ${s.sleep > 0 ? `${Math.floor(s.sleep / 60)}時間${s.sleep % 60}分` : '未記録'}
今日の改善点や明日への具体的なアドバイスを3点、箇条書きで短く教えてください。`

  return callAI(prompt, data)
}

export async function getWeeklyAdvice(data: AppData): Promise<string> {
  if (!getApiKey()) return ''
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    return localDateStr(d)
  })

  const stats = days.map(d => ({ date: d, ...dayStats(data, d) })).filter(s => s.calories > 0)
  if (stats.length === 0) return ''

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
  const avgCal     = avg(stats.map(s => s.calories))
  const avgProtein = avg(stats.map(s => s.protein))
  const avgFat     = avg(stats.map(s => s.fat))
  const avgCarbs   = avg(stats.map(s => s.carbs))
  const avgSodium  = avg(stats.map(s => s.sodium))
  const avgBurned  = avg(stats.map(s => s.burned))
  const avgSleep   = avg(stats.map(s => s.sleep).filter(s => s > 0))
  const avgSteps   = avg(stats.map(s => s.steps).filter(s => s > 0))
  const exerciseDays = stats.filter(s => s.burned > 0).length

  const goal = data.settings.goalCalories ?? 2000
  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight
  const proteinLow  = weightKg ? Math.round(weightKg * 1.6) : null
  const proteinHigh = weightKg ? Math.round(weightKg * 2.0) : null
  const fatLow      = Math.round(goal * 0.20 / 9)
  const fatHigh     = Math.round(goal * 0.30 / 9)
  const carbsLow    = Math.round(goal * 0.50 / 4)
  const carbsHigh   = Math.round(goal * 0.60 / 4)
  const pfcTargetLine = proteinLow != null
    ? `PFC目標レンジ: タンパク質${proteinLow}〜${proteinHigh}g / 脂質${fatLow}〜${fatHigh}g / 炭水化物${carbsLow}〜${carbsHigh}g`
    : `PFC目標レンジ: 脂質${fatLow}〜${fatHigh}g / 炭水化物${carbsLow}〜${carbsHigh}g`

  const prompt = `過去7日間の健康データを週次総括してください（記録: ${stats.length}日）。
1日平均摂取カロリー: ${avgCal}kcal（目標: ${goal}kcal）
平均PFC実績: タンパク質${avgProtein}g / 脂質${avgFat}g / 炭水化物${avgCarbs}g
${pfcTargetLine}
平均塩分相当量: ${(avgSodium * 2.54 / 1000).toFixed(1)}g
平均消費カロリー: ${avgBurned}kcal${avgSteps > 0 ? `\n1日平均歩数: ${avgSteps.toLocaleString()}歩` : ''}
運動した日数: ${exerciseDays}/7日
平均睡眠: ${avgSleep > 0 ? `${Math.floor(avgSleep / 60)}時間${avgSleep % 60}分` : '未記録'}
1週間の傾向と来週への具体的な改善提案を3点、箇条書きで短く教えてください。`

  return callAI(prompt, data)
}
