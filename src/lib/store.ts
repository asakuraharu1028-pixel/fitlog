import { create } from 'zustand'
import type { AppData } from '../types'
import { loadFromDrive, saveToDrive } from './google'
import { localDateStr } from './utils'

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
    set({ isLoading: true, driveError: null })
    try {
      const remote = await loadFromDrive<AppData>()
      if (remote && Array.isArray(remote.bodyRecords)) {
        const merged = migrateUtcDates({ ...DEFAULT_DATA, ...remote })
        set({ data: merged })
        saveToLocal(merged)
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
    // Drive からのロード完了前に保存すると上書きされるためガード
    if (get().isLoading) return
    const next = { ...get().data, ...patch }
    set({ data: next, isSaving: true, driveError: null })
    saveToLocal(next)
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
