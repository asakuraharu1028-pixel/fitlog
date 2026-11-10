import type { RewardSettings } from '../types'
import { useAppStore } from './store'
import { newRewardSettings, patchMilestone } from './rewards'

/**
 * ご褒美設定を保存する。
 * 入力途中の値や連打で古いデータから作らないよう、保存する時点の最新データに fn を当てる。
 */
export function updateRewards(fn: (s: RewardSettings) => RewardSettings) {
  const { data, saveData } = useAppStore.getState()
  const current = data.settings.rewards ?? newRewardSettings()
  return saveData({ settings: { ...data.settings, rewards: fn(current) } })
}

/** ご褒美を受け取った */
export function claimReward(id: string) {
  return updateRewards(s => patchMilestone(s, id, { claimedAt: new Date().toISOString() }))
}
