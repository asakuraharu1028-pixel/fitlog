import type { AppData } from '../types'
import { localDateStr } from './utils'

/** 1週間（月〜日）に使えるフリーズ回数 */
export const FREEZES_PER_WEEK = 1

export type DayStatus = 'recorded' | 'frozen' | 'missed' | 'pending'

export interface StreakInfo {
  /** 現在の連続記録日数（フリーズで守った日は数えない） */
  current: number
  /** 過去最長の連続記録日数 */
  best: number
  todayRecorded: boolean
  /** 今週残っているフリーズ回数 */
  freezesLeftThisWeek: number
  /** 直近7日の状態（古い順） */
  recent: { date: string; status: DayStatus }[]
}

/** 継続を判定するカテゴリ */
export type StreakCategory = 'exercise' | 'meal' | 'body' | 'habit'

export const STREAK_CATEGORIES: StreakCategory[] = ['exercise', 'meal', 'body', 'habit']

export const STREAK_CATEGORY_META: Record<StreakCategory, { icon: string; label: string; hint: string }> = {
  exercise: { icon: '💪', label: '運動',      hint: '有酸素か筋トレを1つ記録' },
  meal:     { icon: '🍽️', label: '食事',      hint: '1食だけでも記録（「食べなかった」もOK）' },
  body:     { icon: '⚖️', label: '体重・睡眠', hint: '体重を量るか、Health Connect の睡眠が同期されればOK' },
  habit:    { icon: '✨', label: '習慣',      hint: 'セルフケアを1つ記録（最低ラインでもOK）' },
}

/** カテゴリごとの「記録した日」 */
export function categoryDates(data: AppData, category: StreakCategory): Set<string> {
  switch (category) {
    case 'exercise':
      return new Set([
        ...data.cardioLogs.map(c => c.date),
        ...data.strengthLogs.map(s => s.date),
      ])
    case 'meal':
      return new Set(data.mealLogs.map(m => m.date))
    case 'body':
      // 睡眠は Health Connect から自動同期されるもの（日付は就寝日）
      return new Set([
        ...data.bodyRecords.map(r => r.date),
        ...(data.sleepLogs ?? []).map(s => s.date),
      ])
    case 'habit':
      return new Set((data.careLogs ?? []).map(l => l.date))
  }
}

/** 何かしら記録した日（全カテゴリの合計） */
export function recordedDates(data: AppData): Set<string> {
  return new Set(STREAK_CATEGORIES.flatMap(c => [...categoryDates(data, c)]))
}

/** 運動（有酸素・筋トレ）を記録した日付 */
export function exerciseDates(data: AppData): Set<string> {
  return categoryDates(data, 'exercise')
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

/** その日が属する週の月曜日 */
function weekKey(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const offset = (d.getDay() + 6) % 7 // 月曜=0
  return addDays(date, -offset)
}

/**
 * カテゴリごとの連続記録を計算する。
 * 記録のない日は、連続中かつその週のフリーズが残っていれば自動でフリーズを使って連続を維持する（フリーズはカテゴリごとに別）。
 * 今日はまだ1日が終わっていないので、未記録でも途切れ扱いにしない。
 */
export function computeCategoryStreak(
  data: AppData, category: StreakCategory, today: string = localDateStr(),
): StreakInfo {
  return computeStreakFromDates(categoryDates(data, category), today)
}

/** 全カテゴリの連続記録 */
export function computeAllStreaks(
  data: AppData, today: string = localDateStr(),
): Record<StreakCategory, StreakInfo> {
  return Object.fromEntries(
    STREAK_CATEGORIES.map(c => [c, computeCategoryStreak(data, c, today)]),
  ) as Record<StreakCategory, StreakInfo>
}

/** 運動だけの連続記録 */
export function computeExerciseStreak(data: AppData, today: string = localDateStr()): StreakInfo {
  return computeCategoryStreak(data, 'exercise', today)
}

function computeStreakFromDates(dates: Set<string>, today: string): StreakInfo {
  const sorted = [...dates].filter(d => d <= today).sort()
  const statuses = new Map<string, DayStatus>()

  let current = 0
  let best = 0
  let usedFreezes = new Map<string, number>() // 現在の連続中に使ったフリーズ（週ごと）

  if (sorted.length > 0) {
    for (let d = sorted[0]; d <= today; d = addDays(d, 1)) {
      const week = weekKey(d)
      if (dates.has(d)) {
        current++
        statuses.set(d, 'recorded')
      } else if (d === today) {
        statuses.set(d, 'pending')
      } else if (current > 0 && (usedFreezes.get(week) ?? 0) < FREEZES_PER_WEEK) {
        usedFreezes.set(week, (usedFreezes.get(week) ?? 0) + 1)
        statuses.set(d, 'frozen')
      } else {
        current = 0
        usedFreezes = new Map()
        statuses.set(d, 'missed')
      }
      if (current > best) best = current
    }
  }

  const recent = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6)
    return { date, status: statuses.get(date) ?? (date === today ? 'pending' : 'missed') }
  })

  return {
    current,
    best,
    todayRecorded: dates.has(today),
    freezesLeftThisWeek: FREEZES_PER_WEEK - (usedFreezes.get(weekKey(today)) ?? 0),
    recent,
  }
}
