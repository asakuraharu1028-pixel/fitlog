import type { AppData } from '../types'

export type TrophyTier = 'bronze' | 'silver' | 'gold'

export interface Trophy {
  id: string
  title: string
  description: string
  icon: string
  tier: TrophyTier
  earned: boolean
}

function maxConsecutiveDays(dates: string[]): number {
  const unique = [...new Set(dates)].sort()
  if (unique.length === 0) return 0
  let max = 1, cur = 1
  for (let i = 1; i < unique.length; i++) {
    const diff = (new Date(unique[i]).getTime() - new Date(unique[i - 1]).getTime()) / 86400000
    cur = diff === 1 ? cur + 1 : 1
    if (cur > max) max = cur
  }
  return max
}

/** 1週間（月〜日）の中で記録した日数の最大値 */
function maxDaysInWeek(dates: string[]): number {
  const counts = new Map<string, number>()
  for (const date of new Set(dates)) {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() - (d.getDay() + 6) % 7) // その週の月曜日
    const week = d.toDateString()
    counts.set(week, (counts.get(week) ?? 0) + 1)
  }
  return Math.max(0, ...counts.values())
}

export function computeTrophies(data: AppData): Trophy[] {
  const mealDates   = [...new Set(data.mealLogs.map(m => m.date))]
  const bodyDates   = [...new Set(data.bodyRecords.map(r => r.date))]
  const exDates     = [...new Set([
    ...data.cardioLogs.map(c => c.date),
    ...data.strengthLogs.map(s => s.date),
  ])]

  const mealStreak  = maxConsecutiveDays(mealDates)
  const bodyStreak  = maxConsecutiveDays(bodyDates)
  const exStreak    = maxConsecutiveDays(exDates)
  const exBestWeek  = maxDaysInWeek(exDates)

  const goalCal = data.settings.goalCalories ?? 2000
  const calGoalDates = mealDates.filter(date => {
    const cal = data.mealLogs
      .filter(m => m.date === date)
      .reduce((s, m) => s + m.entries.reduce((ss, e) => ss + e.calories, 0), 0)
    return cal > 0 && cal <= goalCal
  })
  const calGoalStreak = maxConsecutiveDays(calGoalDates)

  const latestWeight = data.bodyRecords
    .slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight
  const goalWeight = data.settings.goalWeightKg

  const trophies: Trophy[] = [
    {
      id: 'first_meal', title: '初めての食事記録', icon: '🍽️', tier: 'bronze',
      description: '最初の食事を記録した',
      earned: mealDates.length >= 1,
    },
    {
      id: 'meal_3day', title: '食事3日連続', icon: '📅', tier: 'bronze',
      description: '3日連続で食事を記録',
      earned: mealStreak >= 3,
    },
    {
      id: 'meal_7day', title: '食事1週間連続', icon: '🗓️', tier: 'silver',
      description: '7日連続で食事を記録',
      earned: mealStreak >= 7,
    },
    {
      id: 'meal_30day', title: '食事1ヶ月連続', icon: '🏆', tier: 'gold',
      description: '30日連続で食事を記録',
      earned: mealStreak >= 30,
    },
    {
      id: 'first_body', title: '初めての体重記録', icon: '⚖️', tier: 'bronze',
      description: '最初の体重を記録した',
      earned: bodyDates.length >= 1,
    },
    {
      id: 'body_7day', title: '体重1週間連続', icon: '📊', tier: 'silver',
      description: '7日連続で体重を記録',
      earned: bodyStreak >= 7,
    },
    {
      id: 'first_exercise', title: '初めての運動記録', icon: '💪', tier: 'bronze',
      description: '最初の運動を記録した',
      earned: exDates.length >= 1,
    },
    {
      id: 'exercise_3day', title: '運動3日連続', icon: '🔥', tier: 'bronze',
      description: '3日連続で運動を記録',
      earned: exStreak >= 3,
    },
    {
      id: 'exercise_week3', title: '週3回運動', icon: '📆', tier: 'bronze',
      description: '1週間（月〜日）で3日以上運動を記録',
      earned: exBestWeek >= 3,
    },
    {
      id: 'exercise_7day', title: '運動1週間連続', icon: '🏅', tier: 'silver',
      description: '7日連続で運動を記録',
      earned: exStreak >= 7,
    },
    {
      id: 'exercise_10', title: '運動10日達成', icon: '🏃', tier: 'silver',
      description: '10日以上運動を記録した',
      earned: exDates.length >= 10,
    },
    {
      id: 'exercise_30', title: '運動30日達成', icon: '🎖️', tier: 'gold',
      description: '30日以上運動を記録した',
      earned: exDates.length >= 30,
    },
    {
      id: 'exercise_30day', title: '運動1ヶ月連続', icon: '👑', tier: 'gold',
      description: '30日連続で運動を記録',
      earned: exStreak >= 30,
    },
    {
      id: 'cal_goal_1', title: 'カロリー目標達成', icon: '🎯', tier: 'bronze',
      description: '1日カロリー目標内に収めた',
      earned: calGoalDates.length >= 1,
    },
    {
      id: 'cal_goal_7', title: 'カロリー目標7日連続', icon: '⭐', tier: 'gold',
      description: '7日連続でカロリー目標を達成',
      earned: calGoalStreak >= 7,
    },
    {
      id: 'weight_goal', title: '目標体重達成！', icon: '🌟', tier: 'gold',
      description: goalWeight ? `目標体重 ${goalWeight}kg を達成` : '目標体重を設定して達成しよう',
      earned: !!goalWeight && latestWeight != null && latestWeight <= goalWeight,
    },
  ]

  return trophies
}

export const TIER_COLORS: Record<TrophyTier, string> = {
  bronze: 'bg-amber-50 border-amber-200 text-amber-700',
  silver: 'bg-gray-50 border-gray-200 text-gray-600',
  gold:   'bg-yellow-50 border-yellow-200 text-yellow-700',
}
