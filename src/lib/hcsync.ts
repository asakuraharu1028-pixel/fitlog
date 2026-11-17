import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { isNative } from './auth'
import { useAppStore } from './store'
import { localDateStr } from './utils'
import type { BodyRecord } from '../types'
import {
  hcCheckAvailability, hcCheckPermissions, hcOpenPermissions,
  hcReadSteps, hcReadWeight, hcWriteWeight,
  hcReadBodyFat, hcWriteBodyFat,
  hcReadSleep,
} from './healthconnect'

/** 自動同期の最短間隔（アプリ復帰のたびに走らせない） */
const AUTO_INTERVAL_MS = 15 * 60 * 1000
const LAST_SYNC_KEY = 'fitlog-hc-last-sync'

function readLastSync(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_SYNC_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

interface HcSyncState {
  running: boolean
  /** 最後に成功した同期の時刻（ms） */
  lastSyncAt: number | null
  /** 最後の同期のエラー（成功したら null） */
  error: string | null
}

export const useHcSyncStore = create<HcSyncState>(() => ({
  running: false,
  lastSyncAt: readLastSync(),
  error: null,
}))

export interface HcSyncOptions {
  /**
   * true：権限がなければ許可画面を開く（ボタンから押したとき）。
   * false：権限がなければ何もしない（起動時・復帰時の自動同期）。
   */
  interactive: boolean
  /** 進捗ログ（設定画面の詳細表示用） */
  onLog?: (logs: string[]) => void
}

export type HcSyncResult = 'done' | 'skipped' | 'unavailable' | 'denied' | 'error'

/** Health Connect と歩数・体重・体脂肪率・睡眠を同期する */
export async function syncHealthConnect({ interactive, onLog }: HcSyncOptions): Promise<HcSyncResult> {
  if (!isNative) return 'unavailable'
  if (useHcSyncStore.getState().running) return 'skipped'
  useHcSyncStore.setState({ running: true })

  const logs: string[] = []
  const log = (l: string) => { logs.push(l); onLog?.([...logs]) }

  try {
    const status = await hcCheckAvailability()
    log(`HC 状態: ${status}`)
    if (status !== 'available') {
      log('✗ Health Connect が利用できません')
      return 'unavailable'
    }

    log('パーミッション確認中...')
    let granted = await hcCheckPermissions()
    if (!granted && interactive) {
      log('パーミッション画面を開いています...')
      granted = await hcOpenPermissions()
    }
    if (!granted) {
      log('✗ パーミッションが許可されませんでした')
      return 'denied'
    }
    log('✓ パーミッション許可済み')

    const today = localDateStr()
    const past30 = localDateStr(new Date(Date.now() - 30 * 86400000))

    // 歩数を HC から読み込んで FitLog に保存
    log('歩数を読み込み中...')
    const steps = await hcReadSteps(past30, today)
    log(`✓ 歩数: ${steps.length}件`)
    if (steps.length > 0) {
      const { data: stepsData, saveData: stepsSave } = useAppStore.getState()
      // HC から取得した日付ごとに合計（同日複数レコードを集計）
      const hcMap = new Map<string, number>()
      for (const s of steps) hcMap.set(s.date, (hcMap.get(s.date) ?? 0) + s.steps)
      // 既存の stepLogs に HC データをマージ（HC 側を優先）
      const existingOther = (stepsData.stepLogs ?? []).filter(s => !hcMap.has(s.date))
      const newStepLogs = [
        ...existingOther,
        ...Array.from(hcMap.entries()).map(([date, st]) => ({ date, steps: st })),
      ].sort((a, b) => a.date.localeCompare(b.date))
      await stepsSave({ stepLogs: newStepLogs })
    }

    // 体重を HC から読み込んで FitLog に追加
    log('体重を HC から読み込み中...')
    const weights = await hcReadWeight(past30, today)
    log(`✓ 体重: ${weights.length}件`)
    const { data: appData, saveData } = useAppStore.getState()
    const existingDates = new Set(appData.bodyRecords.map(r => r.date))
    const newRecords: BodyRecord[] = weights
      .filter(w => !existingDates.has(w.date))
      .map(w => {
        const h = appData.settings.heightCm / 100
        const bmi = Math.round(w.weightKg / (h * h) * 10) / 10
        return { id: nanoid(), date: w.date, weight: w.weightKg, bmi }
      })
    if (newRecords.length > 0) {
      await saveData({ bodyRecords: [...appData.bodyRecords, ...newRecords].sort((a, b) => a.date.localeCompare(b.date)) })
      log(`✓ 体重 ${newRecords.length}件を FitLog に追加`)
    }

    // FitLog の体重を HC に書き込み（日付ごとに上書きされるので重複しない）
    log('FitLog の体重を HC に書き込み中...')
    for (const r of appData.bodyRecords.slice(-7)) {
      try { await hcWriteWeight(r.date, r.weight) } catch { /* 1件の失敗は無視 */ }
    }
    log('✓ 直近7日分の体重を HC に書き込み')

    // 体脂肪率を HC から読み込んで FitLog に追加
    log('体脂肪率を HC から読み込み中...')
    const bodyFats = await hcReadBodyFat(past30, today)
    log(`✓ 体脂肪率: ${bodyFats.length}件`)
    if (bodyFats.length > 0) {
      const { data: bfData, saveData: bfSave } = useAppStore.getState()
      const bfByDate = new Map(bodyFats.map(b => [b.date, Math.round(b.bodyFatPct * 100) / 100]))
      const updatedRecords: BodyRecord[] = bfData.bodyRecords.map(r =>
        bfByDate.has(r.date) ? { ...r, bodyFatPct: bfByDate.get(r.date) as number } : r
      )
      await bfSave({ bodyRecords: updatedRecords })
      log('✓ 体脂肪率を FitLog に反映')
    }

    // FitLog の体脂肪率を HC に書き込み
    log('FitLog の体脂肪率を HC に書き込み中...')
    const { data: bfWriteData } = useAppStore.getState()
    for (const r of bfWriteData.bodyRecords.slice(-7)) {
      if (r.bodyFatPct != null) {
        try { await hcWriteBodyFat(r.date, r.bodyFatPct) } catch { /* 1件の失敗は無視 */ }
      }
    }
    log('✓ 直近7日分の体脂肪率を HC に書き込み')

    // 睡眠を HC から読み込んで FitLog に追加
    log('睡眠を HC から読み込み中...')
    const sleeps = await hcReadSleep(past30, today)
    log(`✓ 睡眠: ${sleeps.length}件取得`)
    if (sleeps.length === 0) {
      log('⚠ HC に睡眠データがないか、SleepSessionRecord が記録されていない可能性があります')
    }
    const { data: latestData, saveData: sleepSave } = useAppStore.getState()
    // HC データで startTime ごとに上書き（upsert）。HC 側を正とする
    // ※ 同日に本睡眠＋仮眠など複数セッションがある場合も全て保持する
    // ※ 重複するセッション（ステージレコード）は最長のものだけ残す
    const deduped = sleeps.filter(s => {
      const sStart = new Date(s.startTime).getTime()
      const sEnd   = new Date(s.endTime).getTime()
      return !sleeps.some(o => {
        if (o === s) return false
        const oStart = new Date(o.startTime).getTime()
        const oEnd   = new Date(o.endTime).getTime()
        return oStart <= sStart && oEnd >= sEnd && o.durationMin > s.durationMin
      })
    })
    const hcSleepByStart = new Map(deduped.map(s => [s.startTime, s]))
    // 再同期でも同じ startTime のレコードは既存 ID を再利用し、Drive マージで古いデータが勝つのを防ぐ
    const existingIdByStart = new Map((latestData.sleepLogs ?? []).map(s => [s.startTime, s.id]))
    const existingOtherSleeps = (latestData.sleepLogs ?? []).filter(s => !hcSleepByStart.has(s.startTime))
    const hcSleepRecords = Array.from(hcSleepByStart.values()).map(s => ({
      id: existingIdByStart.get(s.startTime) ?? nanoid(),
      ...s,
    }))
    const mergedSleepLogs = [...existingOtherSleeps, ...hcSleepRecords]
      .sort((a, b) => a.date.localeCompare(b.date))
    await sleepSave({ sleepLogs: mergedSleepLogs })
    log(`✓ 睡眠 ${hcSleepRecords.length}件を FitLog に反映（既存を HC データで更新）`)

    log('🎉 同期完了！')
    const now = Date.now()
    try { localStorage.setItem(LAST_SYNC_KEY, String(now)) } catch { /* 保存できなくても続行 */ }
    useHcSyncStore.setState({ lastSyncAt: now, error: null })
    return 'done'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`✗ エラー: ${msg}`)
    useHcSyncStore.setState({ error: msg })
    return 'error'
  } finally {
    useHcSyncStore.setState({ running: false })
  }
}

/** 起動時・復帰時の自動同期。前回から間隔が空いていて、権限があるときだけ動く */
export function autoSyncHealthConnect() {
  if (!isNative) return
  const { lastSyncAt, running } = useHcSyncStore.getState()
  if (running) return
  if (lastSyncAt && Date.now() - lastSyncAt < AUTO_INTERVAL_MS) return
  void syncHealthConnect({ interactive: false })
}
