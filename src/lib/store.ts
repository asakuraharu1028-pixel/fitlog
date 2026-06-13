import { create } from 'zustand'
import type { AppData, StepLog, SleepLog } from '../types'
import { loadFromDrive, saveToDrive } from './google'
import { localDateStr } from './utils'
import { syncWidgetData } from './widget'

// id フィールドを持つレコードをマージ（ローカル優先、どちらにしかないものも保持）
function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of remote) map.set(item.id, item)
  for (const item of local) map.set(item.id, item) // ローカルが新しい場合はローカル優先
  return Array.from(map.values())
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
    mealLogs:     mergeById(local.mealLogs,     remote.mealLogs),
    bodyRecords:  mergeById(local.bodyRecords,  remote.bodyRecords),
    cardioLogs:   mergeById(local.cardioLogs,   remote.cardioLogs),
    strengthLogs: mergeById(local.strengthLogs, remote.strengthLogs),
    sleepLogs:    mergeSleepLogs(local.sleepLogs  ?? [], remote.sleepLogs  ?? []),
    adviceLogs:   mergeById(local.adviceLogs ?? [], remote.adviceLogs ?? []),
    stepLogs:     mergeStepLogs(local.stepLogs ?? [], remote.stepLogs ?? []),
    templateFoods: mergeById(local.templateFoods ?? [], remote.templateFoods ?? []),
    periodLogs:   mergeById(local.periodLogs ?? [], remote.periodLogs ?? []),
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
    if (local) syncWidgetData(local)

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
        // マージ結果を Drive にも書き戻す（ローカルのみのレコードを反映）
        saveToDrive(merged).catch((e) => console.warn('Drive write-back error:', e))
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
    const next = { ...get().data, ...patch }
    set({ data: next, isSaving: true, driveError: null })
    saveToLocal(next)
    syncWidgetData(next)
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
