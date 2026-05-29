import { create } from 'zustand'
import type { AppData } from '../types'
import { loadFromDrive, saveToDrive } from './google'

const DEFAULT_DATA: AppData = {
  bodyRecords: [],
  mealLogs: [],
  cardioLogs: [],
  strengthLogs: [],
  settings: { heightCm: 170 },
}

interface AppStore {
  data: AppData
  isLoading: boolean
  isSaving: boolean
  isAuthenticated: boolean
  setAuthenticated: (v: boolean) => void
  loadData: () => Promise<void>
  saveData: (patch: Partial<AppData>) => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  data: DEFAULT_DATA,
  isLoading: false,
  isSaving: false,
  isAuthenticated: false,

  setAuthenticated: (v) => set({ isAuthenticated: v }),

  loadData: async () => {
    set({ isLoading: true })
    try {
      const remote = await loadFromDrive<AppData>()
      set({ data: remote ?? DEFAULT_DATA })
    } finally {
      set({ isLoading: false })
    }
  },

  saveData: async (patch) => {
    const next = { ...get().data, ...patch }
    set({ data: next, isSaving: true })
    try {
      await saveToDrive(next)
    } finally {
      set({ isSaving: false })
    }
  },
}))
