import { create } from 'zustand'
import type { AppData } from '../types'
import { loadFromDrive, saveToDrive } from './google'

const STORAGE_KEY = 'fitlog-data'

const DEFAULT_DATA: AppData = {
  bodyRecords: [],
  mealLogs: [],
  cardioLogs: [],
  strengthLogs: [],
  settings: { heightCm: 170 },
}

function loadFromLocal(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AppData) : null
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
      if (remote) {
        set({ data: remote })
        saveToLocal(remote)
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
