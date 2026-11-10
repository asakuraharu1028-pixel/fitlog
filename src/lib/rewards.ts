import { nanoid } from 'nanoid'
import type { AppData, RewardMilestone, RewardSettings } from '../types'
import { categoryDates, STREAK_CATEGORIES, type StreakCategory } from './streak'
import { localDateStr } from './utils'

/** 節目を追加するときの候補（日数） */
export const MILESTONE_PRESETS = [7, 14, 30, 60, 100]

export function newRewardSettings(today: string = localDateStr()): RewardSettings {
  return { startDate: today, updatedAt: new Date().toISOString(), milestones: [] }
}

export function newMilestone(days: number): RewardMilestone {
  return { id: 'reward_' + nanoid(8), days, label: '', updatedAt: new Date().toISOString() }
}

/** 節目を変更する（変更日時も更新する） */
export function patchMilestone(
  s: RewardSettings, id: string, patch: Partial<Omit<RewardMilestone, 'id' | 'updatedAt'>>,
): RewardSettings {
  const updatedAt = new Date().toISOString()
  return { ...s, milestones: s.milestones.map(m => (m.id === id ? { ...m, ...patch, updatedAt } : m)) }
}

/**
 * ローカルと Drive のご褒美設定をマージする。
 * settings は Drive 優先で上書きされるが、受け取り記録などが消えないよう、節目は id ごとに新しい方を残す。
 * （片方にしかない節目は残すので、別の端末で削除した節目は復活することがある）
 */
export function mergeRewards(
  local: RewardSettings | undefined, remote: RewardSettings | undefined,
): RewardSettings | undefined {
  if (!local) return remote
  if (!remote) return local
  const newer = <T extends { updatedAt?: string }>(a: T, b: T) => ((a.updatedAt ?? '') >= (b.updatedAt ?? '') ? a : b)

  const byId = new Map<string, RewardMilestone>()
  for (const m of remote.milestones) byId.set(m.id, m)
  for (const m of local.milestones) {
    const r = byId.get(m.id)
    byId.set(m.id, r ? newer(m, r) : m)
  }
  const base = newer(local, remote)
  return { startDate: base.startDate, updatedAt: base.updatedAt, milestones: [...byId.values()] }
}

export function sortMilestones(list: RewardMilestone[]): RewardMilestone[] {
  return [...list].sort((a, b) => a.days - b.days)
}

export interface RewardProgress {
  /** 4項目の累計記録日数の平均（1日で4項目そろえば +1、2項目なら +0.5） */
  average: number
  /** 項目ごとの累計記録日数 */
  perCategory: Record<StreakCategory, number>
  /** 今日記録した項目数（0〜4） */
  todayCount: number
  /** 日数の少ない順 */
  milestones: (RewardMilestone & { reached: boolean })[]
  /** 次に目指す節目（すべて到達済みなら undefined） */
  next?: RewardMilestone
  /** 到達したのにまだ受け取っていない節目 */
  unclaimed: RewardMilestone[]
}

/**
 * ご褒美の進み具合。
 * 連続日数ではなく「始めた日からの記録日数」を数えるので、途切れても積み上げは減らない。
 */
export function computeRewardProgress(
  data: AppData, settings: RewardSettings, today: string = localDateStr(),
): RewardProgress {
  const perCategory = {} as Record<StreakCategory, number>
  let todayCount = 0
  for (const c of STREAK_CATEGORIES) {
    const dates = categoryDates(data, c)
    perCategory[c] = [...dates].filter(d => d >= settings.startDate && d <= today).length
    if (dates.has(today) && today >= settings.startDate) todayCount++
  }
  const total = STREAK_CATEGORIES.reduce((sum, c) => sum + perCategory[c], 0)
  const average = total / STREAK_CATEGORIES.length

  const milestones = sortMilestones(settings.milestones).map(m => ({ ...m, reached: average >= m.days }))
  return {
    average,
    perCategory,
    todayCount,
    milestones,
    next: milestones.find(m => !m.reached),
    unclaimed: milestones.filter(m => m.reached && !m.claimedAt),
  }
}

/** 平均日数の表示（0.25 刻みなので小数2桁まで。整数なら小数なし） */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')
}
