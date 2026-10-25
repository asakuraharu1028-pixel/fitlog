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

/** 「記録した日」とみなす日付（食事・体重・運動。自動同期の歩数・睡眠は含めない） */
export function recordedDates(data: AppData): Set<string> {
  return new Set([
    ...data.mealLogs.map(m => m.date),
    ...data.bodyRecords.map(r => r.date),
    ...data.cardioLogs.map(c => c.date),
    ...data.strengthLogs.map(s => s.date),
  ])
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
 * 連続記録を計算する。
 * 記録のない日は、連続中かつその週のフリーズが残っていれば自動でフリーズを使って連続を維持する。
 * 今日はまだ1日が終わっていないので、未記録でも途切れ扱いにしない。
 */
export function computeStreak(data: AppData, today: string = localDateStr()): StreakInfo {
  const dates = recordedDates(data)
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
