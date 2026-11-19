import { create } from 'zustand'
import type { AppData, StepLog, SleepLog } from '../types'
import { loadFromDrive, saveToDrive } from './google'
import { localDateStr } from './utils'
import { syncWidgetData } from './widget'
import { syncReminders } from './reminders'
import { mergeRewards } from './rewards'
import { autoExportMonthlyCSV } from './autoExport'

// 記録ごとの「最後に変えた時刻」（ISO 文字列）。saveData() が変わった記録にだけ付ける。
// 付く前の古い記録にはない
type Stamped = { id: string; updatedAt?: string }
const updatedAtOf = (item: object) => (item as Stamped).updatedAt

/**
 * 同じ id の記録が両方にあるときに残す方を決める。
 * 両方に時刻があれば新しい方、片方にだけあればそちら（新しい版で直した記録）、
 * どちらにもなければ Drive 側（最後にどこかの端末が保存した状態）
 */
function pickNewer<T extends object>(local: T, remote: T): T {
  const l = updatedAtOf(local)
  const r = updatedAtOf(remote)
  if (l && r) return l > r ? local : remote
  if (l) return local
  return remote
}

// id フィールドを持つレコードをマージ（どちらにしかないものも保持。両方にあるものは pickNewer で選ぶ）
function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of remote) map.set(item.id, item)
  for (const item of local) {
    const other = map.get(item.id)
    map.set(item.id, other ? pickNewer(item, other) : item)
  }
  return Array.from(map.values())
}

// id で合わせる記録の配列（saveData() で時刻を付ける対象）
const STAMPED_KEYS = [
  'mealLogs', 'bodyRecords', 'cardioLogs', 'strengthLogs', 'sleepLogs',
  'adviceLogs', 'templateFoods', 'periodLogs', 'careLogs',
] as const satisfies readonly (keyof AppData)[]

const withoutUpdatedAt = (item: object) => {
  const rest = { ...(item as Stamped) }
  delete rest.updatedAt
  return JSON.stringify(rest)
}

/** 保存前と比べて、新しく足した記録と中身が変わった記録にだけ updatedAt を付ける */
function stampChanged<T extends { id: string }>(prev: T[] | undefined, next: T[], now: string): T[] {
  const before = new Map((prev ?? []).map(x => [x.id, x]))
  return next.map(item => {
    const old = before.get(item.id)
    if (old === item) return item
    if (old && withoutUpdatedAt(old) === withoutUpdatedAt(item)) return item
    return { ...item, updatedAt: now }
  })
}

function stampPatch(prev: AppData, patch: Partial<AppData>): Partial<AppData> {
  const now = new Date().toISOString()
  const stamped: Partial<AppData> = { ...patch }
  for (const key of STAMPED_KEYS) {
    const next = patch[key]
    if (next) (stamped as Record<string, unknown>)[key] = stampChanged(prev[key] as Stamped[] | undefined, next as Stamped[], now)
  }
  return stamped
}

// StepLog は id なし・date キーでマージ（歩数の多い方を優先）
function mergeStepLogs(local: StepLog[], remote: StepLog[]): StepLog[] {
  const map = new Map<string, StepLog>()
  for (const item of remote) map.set(item.date, item)
  for (const item of local) {
    const existing = map.get(item.date)
    // ローカルとリモート両方にある場合は歩数が多い方を採用
    if (!existing || item.steps > existing.steps) {
      map.set(item.date, item)
    }
  }
  return Array.from(map.values())
}

// SleepLog は id でマージした後、startTime で重複排除（HC再同期でIDが変わる場合の対策）
function mergeSleepLogs(local: SleepLog[], remote: SleepLog[]): SleepLog[] {
  const byId = mergeById(local, remote)
  const map = new Map<string, SleepLog>()
  for (const item of byId) {
    if (!map.has(item.startTime)) {
      map.set(item.startTime, item)
    }
  }
  return Array.from(map.values())
}

function mergeData(local: AppData, remote: AppData): AppData {
  return {
    ...remote, // settings 等は Drive 側を優先
    // ご褒美の受け取り記録などが Drive 側の古い settings で消えないよう、節目ごとに新しい方を残す
    settings: {
      ...remote.settings,
      rewards: mergeRewards(local.settings?.rewards, remote.settings?.rewards),
    },
    mealLogs:     mergeById(local.mealLogs,     remote.mealLogs),
    bodyRecords:  mergeById(local.bodyRecords,  remote.bodyRecords),
    cardioLogs:   mergeById(local.cardioLogs,   remote.cardioLogs),
    strengthLogs: mergeById(local.strengthLogs, remote.strengthLogs),
    sleepLogs:    mergeSleepLogs(local.sleepLogs  ?? [], remote.sleepLogs  ?? []),
    adviceLogs:   mergeById(local.adviceLogs ?? [], remote.adviceLogs ?? []),
    stepLogs:     mergeStepLogs(local.stepLogs ?? [], remote.stepLogs ?? []),
    templateFoods: mergeById(local.templateFoods ?? [], remote.templateFoods ?? []),
    periodLogs:   mergeById(local.periodLogs ?? [], remote.periodLogs ?? []),
    careLogs:     mergeById(local.careLogs ?? [], remote.careLogs ?? []),
  }
}

/**
 * UTC日付で保存されてしまったレコードを修正するマイグレーション。
 * 日付がローカル今日より未来になっているレコードを1日前に戻す。
 * （JST深夜0〜8時に入力するとUTCで翌日になる問題の修正）
 */
function migrateUtcDates(data: AppData): AppData {
  const today = localDateStr()

  const fixDate = (date: string) => {
    if (date > today) {
      const d = new Date(date + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      return localDateStr(d)
    }
    return date
  }

  return {
    ...data,
    mealLogs:    data.mealLogs.map(r => ({ ...r, date: fixDate(r.date) })),
    bodyRecords: data.bodyRecords.map(r => ({ ...r, date: fixDate(r.date) })),
    cardioLogs:  data.cardioLogs.map(r => ({ ...r, date: fixDate(r.date) })),
    strengthLogs: data.strengthLogs.map(r => ({ ...r, date: fixDate(r.date) })),
    sleepLogs:   (data.sleepLogs ?? []).map(r => ({ ...r, date: fixDate(r.date) })),
    stepLogs:    (data.stepLogs  ?? []).map(r => ({ ...r, date: fixDate(r.date) })),
    adviceLogs:  (data.adviceLogs ?? []).map(r => ({ ...r, date: fixDate(r.date) })),
    careLogs:    (data.careLogs ?? []).map(r => ({ ...r, date: fixDate(r.date) })),
  }
}

const STORAGE_KEY = 'fitlog-data'

const DEFAULT_DATA: AppData = {
  bodyRecords: [],
  mealLogs: [],
  cardioLogs: [],
  strengthLogs: [],
  sleepLogs: [],
  stepLogs: [],
  adviceLogs: [],
  careLogs: [],
  settings: { heightCm: 170 },
}


function isValidAppData(d: unknown): d is AppData {
  return !!d && typeof d === 'object' && Array.isArray((d as AppData).bodyRecords)
}

function loadFromLocal(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isValidAppData(parsed)) {
      localStorage.removeItem(STORAGE_KEY) // 不正データを削除
      return null
    }
    return migrateUtcDates({ ...DEFAULT_DATA, ...parsed })
  } catch {
    return null
  }
}

function saveToLocal(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

interface AppStore {
  data: AppData
  isLoading: boolean
  isSaving: boolean
  isAuthenticated: boolean
  driveError: string | null
  setAuthenticated: (v: boolean) => void
  loadData: () => Promise<void>
  saveData: (patch: Partial<AppData>) => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  data: loadFromLocal() ?? DEFAULT_DATA,
  isLoading: false,
  isSaving: false,
  isAuthenticated: false,
  driveError: null,

  setAuthenticated: (v) => set({ isAuthenticated: v }),

  loadData: async () => {
    // ローカルデータを即時ウィジェットに反映（オフライン時も表示される）
    const local = loadFromLocal()
    if (local) { syncWidgetData(local); syncReminders(local) }

    set({ isLoading: true, driveError: null })
    try {
      const remote = await loadFromDrive<AppData>()
      if (remote && Array.isArray(remote.bodyRecords)) {
        const remoteWithDefaults = migrateUtcDates({ ...DEFAULT_DATA, ...remote })
        // ロード完了時点のストア（saveData が isLoading 中に書き込んでいる場合がある）とマージ
        const currentLocal = loadFromLocal() ?? get().data
        const merged = migrateUtcDates(mergeData(currentLocal, remoteWithDefaults))
        set({ data: merged })
        saveToLocal(merged)
        syncWidgetData(merged)
        syncReminders(merged)
        // マージ結果を Drive にも書き戻す（ローカルのみのレコードを反映）
        saveToDrive(merged).catch((e) => console.warn('Drive write-back error:', e))
        // 毎月1回、CSV をマイドライブに書き出す（権限がない・オフラインなどの失敗は記録だけして次回に回す）
        autoExportMonthlyCSV(merged).catch((e) => console.warn('CSV auto-export error:', e))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Drive load error:', msg)
      set({ driveError: `Drive同期エラー: ${msg}` })
    } finally {
      set({ isLoading: false })
    }
  },

  saveData: async (patch) => {
    const prev = get().data
    const next = { ...prev, ...stampPatch(prev, patch) }
    set({ data: next, isSaving: true, driveError: null })
    saveToLocal(next)
    syncWidgetData(next)
    syncReminders(next)
    try {
      await saveToDrive(next)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Drive save error:', msg)
      set({ driveError: `Drive保存エラー（ローカルには保存済）: ${msg}` })
    } finally {
      set({ isSaving: false })
    }
  },
}))
