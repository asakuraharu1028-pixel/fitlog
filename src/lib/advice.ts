import { getApiKey } from './gemini'
import { localDateStr } from './utils'
import type { MealLog, CardioLog, StrengthLog, AppData } from '../types'

function isOpenRouterKey(key: string) {
  return key.startsWith('sk-or-')
}


async function callAI(prompt: string): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  if (isOpenRouterKey(apiKey)) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemma-4-26b-a4b-it:free',
        messages: [
          { role: 'system', content: 'あなたは健康管理アドバイザーです。短く具体的な日本語でアドバイスしてください。1〜2文で。' },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`OpenRouter エラー ${res.status}: ${err?.error?.message ?? res.statusText}`)
    }
    const data = await res.json()
    return (data.choices?.[0]?.message?.content ?? '').trim()
  }

  // Gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `健康管理アドバイザーとして短く具体的な日本語でアドバイスしてください（1〜2文）:\n${prompt}` }] }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gemini エラー ${res.status}: ${err?.error?.message ?? res.statusText}`)
  }
  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
}

function todayCalorieSummary(data: AppData, goalCalories: number) {
  const today = localDateStr()
  const intake = data.mealLogs
    .filter(m => m.date === today)
    .reduce((s, m) => s + m.entries.reduce((a, e) => a + e.calories, 0), 0)
  const burned = [
    ...data.cardioLogs.filter(c => c.date === today).map(c => c.caloriesBurned),
    ...data.strengthLogs.filter(s => s.date === today).map(s => s.estimatedCalories ?? 0),
  ].reduce((a, b) => a + b, 0)
  return { intake, burned, remaining: goalCalories - intake + burned }
}

export async function getMealAdvice(meal: MealLog, data: AppData): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const goal = data.settings.goalCalories ?? 2000
  const { intake, burned, remaining } = todayCalorieSummary(data, goal)
  const totalProtein = data.mealLogs
    .filter(m => m.date === meal.date)
    .flatMap(m => m.entries)
    .reduce((s, e) => s + e.protein, 0)
  const mealNames = meal.entries.map(e => `${e.foodName}(${e.calories}kcal)`).join('、')
  const mealType = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' }[meal.mealType]

  const prompt = `
${mealType}に「${mealNames}」を記録しました。
今日の状況：摂取${intake}kcal / 目標${goal}kcal / 消費${burned}kcal / 残り${remaining}kcal
今日のタンパク質合計：${totalProtein.toFixed(1)}g
この食事内容と今日の栄養バランスを踏まえ、次の食事や生活習慣についてアドバイスをしてください。`

  return callAI(prompt)
}

export async function getCardioAdvice(log: CardioLog, data: AppData): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const goal = data.settings.goalCalories ?? 2000
  const { intake, burned } = todayCalorieSummary(data, goal)
  const weight = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight

  const prompt = `
有酸素運動「${log.name}」を${log.durationMin}分行い、${log.caloriesBurned}kcal消費しました。
今日の摂取：${intake}kcal / 消費合計：${burned}kcal${weight ? ` / 体重：${weight}kg` : ''}
この運動内容に対するアドバイスや、次回へのアドバイスをしてください。`

  return callAI(prompt)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getStrengthAdvice(log: StrengthLog, _data: AppData): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const setsStr = log.sets.map((s, i) => `${i + 1}セット目: ${s.weight}kg × ${s.reps}回`).join(', ')

  const prompt = `
筋トレ「${log.name}」を行いました。${setsStr}
推定消費：${log.estimatedCalories ?? 0}kcal
このトレーニング内容に対するフォームや改善点、次回へのアドバイスをしてください。`

  return callAI(prompt)
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
  const burned   = data.cardioLogs.filter(c => c.date === date).reduce((s, c) => s + c.caloriesBurned, 0)
    + data.strengthLogs.filter(s => s.date === date).reduce((s, t) => s + (t.estimatedCalories ?? 0), 0)
  const sleep    = (data.sleepLogs ?? []).filter(s => s.date === date).reduce((s, r) => s + r.durationMin, 0)
  return { calories, protein, fat, carbs, sodium, burned, sleep }
}

export async function getDailyAdvice(data: AppData): Promise<string> {
  if (!getApiKey()) return ''
  const today = localDateStr()
  const s = dayStats(data, today)
  const goal = data.settings.goalCalories ?? 2000

  const prompt = `今日（${today}）の健康データを総括してください。
摂取カロリー: ${s.calories}kcal（目標: ${goal}kcal）
PFC: タンパク質${s.protein.toFixed(1)}g / 脂質${s.fat.toFixed(1)}g / 炭水化物${s.carbs.toFixed(1)}g
塩分相当量: ${(s.sodium * 2.54 / 1000).toFixed(1)}g（目安: 男性7.5g未満、女性6.5g未満）
消費カロリー: ${s.burned}kcal
睡眠: ${s.sleep > 0 ? `${Math.floor(s.sleep / 60)}時間${s.sleep % 60}分` : '未記録'}
今日の改善点や明日への具体的なアドバイスを3点、箇条書きで短く教えてください。`

  return callAI(prompt)
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
  const exerciseDays = stats.filter(s => s.burned > 0).length

  const prompt = `過去7日間の健康データを週次総括してください（記録: ${stats.length}日）。
1日平均摂取カロリー: ${avgCal}kcal
平均PFC: タンパク質${avgProtein}g / 脂質${avgFat}g / 炭水化物${avgCarbs}g
平均塩分相当量: ${(avgSodium * 2.54 / 1000).toFixed(1)}g
平均消費カロリー: ${avgBurned}kcal
運動した日数: ${exerciseDays}/7日
平均睡眠: ${avgSleep > 0 ? `${Math.floor(avgSleep / 60)}時間${avgSleep % 60}分` : '未記録'}
1週間の傾向と来週への具体的な改善提案を3点、箇条書きで短く教えてください。`

  return callAI(prompt)
}
