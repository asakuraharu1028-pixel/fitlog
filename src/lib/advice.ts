import { getApiKey } from './gemini'
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
        model: 'google/gemma-4-31b-it:free',
        messages: [
          { role: 'system', content: 'あなたは健康管理アドバイザーです。短く具体的な日本語でアドバイスしてください。1〜2文で。' },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return (data.choices?.[0]?.message?.content ?? '').trim()
  }

  // Gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `健康管理アドバイザーとして短く具体的な日本語でアドバイスしてください（1〜2文）:\n${prompt}` }] }],
    }),
  })
  if (!res.ok) return ''
  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
}

function todayCalorieSummary(data: AppData, goalCalories: number) {
  const today = new Date().toISOString().slice(0, 10)
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

export async function getStrengthAdvice(log: StrengthLog, data: AppData): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const setsStr = log.sets.map((s, i) => `${i + 1}セット目: ${s.weight}kg × ${s.reps}回`).join(', ')

  const prompt = `
筋トレ「${log.name}」を行いました。${setsStr}
推定消費：${log.estimatedCalories ?? 0}kcal
このトレーニング内容に対するフォームや改善点、次回へのアドバイスをしてください。`

  return callAI(prompt)
}
