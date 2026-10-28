import { registerPlugin } from '@capacitor/core'
import type { AppData } from '../types'
import { localDateStr } from './utils'
import { hasExerciseOn } from './quickexercise'
import { computeExerciseStreak } from './streak'

interface FitlogWidgetPlugin {
  updateData(data: {
    todayIntake?: number
    todayBurned?: number
    latestWeight?: string
    lastUpdated?: string
    exerciseDone?: boolean
    exerciseStreak?: number
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

    // 運動画面の「消費 kcal」と同じく、有酸素と筋トレの合計
    const todayBurned =
      data.cardioLogs.filter(c => c.date === today).reduce((sum, c) => sum + c.caloriesBurned, 0) +
      data.strengthLogs.filter(s => s.date === today).reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0)

    const latestBody = [...data.bodyRecords].sort((a, b) => b.date.localeCompare(a.date))[0]

    await FitlogWidget.updateData({
      todayIntake: Math.round(todayIntake),
      todayBurned: Math.round(todayBurned),
      latestWeight: latestBody ? latestBody.weight.toFixed(1) : undefined,
      lastUpdated: today,
      exerciseDone: hasExerciseOn(data, today),
      exerciseStreak: computeExerciseStreak(data, today).current,
    })
  } catch {
    // ウィジェット非対応環境（web等）では無視
  }
}
