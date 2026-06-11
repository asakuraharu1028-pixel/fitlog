import { registerPlugin } from '@capacitor/core'
import type { AppData } from '../types'
import { localDateStr } from './utils'

interface FitlogWidgetPlugin {
  updateData(data: {
    todayIntake?: number
    todayBurned?: number
    latestWeight?: string
    lastUpdated?: string
  }): Promise<{ updated: number }>
}

const FitlogWidget = registerPlugin<FitlogWidgetPlugin>('FitlogWidget', {
  web: {
    async updateData() { return { updated: 0 } },
  },
})

export async function syncWidgetData(data: AppData) {
  try {
    const today = localDateStr()

    const todayIntake = data.mealLogs
      .filter(m => m.date === today && !m.skipped)
      .flatMap(m => m.entries)
      .reduce((sum, e) => sum + e.calories, 0)

    const todayBurned = data.cardioLogs
      .filter(c => c.date === today)
      .reduce((sum, c) => sum + c.caloriesBurned, 0)

    const latestBody = [...data.bodyRecords].sort((a, b) => b.date.localeCompare(a.date))[0]

    await FitlogWidget.updateData({
      todayIntake: Math.round(todayIntake),
      todayBurned: Math.round(todayBurned),
      latestWeight: latestBody ? latestBody.weight.toFixed(1) : undefined,
      lastUpdated: today,
    })
  } catch {
    // ウィジェット非対応環境（web等）では無視
  }
}
