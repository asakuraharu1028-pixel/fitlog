import { registerPlugin } from '@capacitor/core'
import type { AppData } from '../types'
import { localDateStr } from './utils'
import { computeAllStreaks, STREAK_CATEGORIES, type DayStatus, type StreakCategory } from './streak'
import { isNative } from './auth'

/**
 * カテゴリ別の連続記録（例: mealDone / mealStreak / mealBest / mealFreezesLeft / mealRecent）。
 * Recent は直近7日の状態を1文字ずつ（古い順。R=記録 F=フリーズ M=記録なし P=未定）。
 * Android 側は StreakWidget.kt の StreakCategory.key と対応。
 */
type StreakWidgetFields = {
  [K in StreakCategory as `${K}Done`]: boolean
} & {
  [K in StreakCategory as `${K}Streak` | `${K}Best` | `${K}FreezesLeft`]: number
} & {
  [K in StreakCategory as `${K}Recent`]: string
}

interface FitlogWidgetPlugin {
  updateData(data: {
    todayIntake?: number
    todayBurned?: number
    latestWeight?: string
    lastUpdated?: string
  } & Partial<StreakWidgetFields>): Promise<{ updated: number }>
  consumeLaunchRoute(): Promise<{ route?: string | null }>
  addListener(event: 'routeRequested', fn: (e: { route: string }) => void): Promise<{ remove: () => void }>
}

const FitlogWidget = registerPlugin<FitlogWidgetPlugin>('FitlogWidget', {
  web: {
    async updateData() { return { updated: 0 } },
    async consumeLaunchRoute() { return { route: null } },
    async addListener() { return { remove: () => {} } },
  },
})

const STATUS_CHAR: Record<DayStatus, string> = { recorded: 'R', frozen: 'F', missed: 'M', pending: 'P' }

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

    const streaks = computeAllStreaks(data, today)
    const streakFields: Record<string, boolean | number | string> = {}
    for (const c of STREAK_CATEGORIES) {
      const st = streaks[c]
      streakFields[`${c}Done`] = st.todayRecorded
      streakFields[`${c}Streak`] = st.current
      streakFields[`${c}Best`] = st.best
      streakFields[`${c}FreezesLeft`] = st.freezesLeftThisWeek
      streakFields[`${c}Recent`] = st.recent.map(d => STATUS_CHAR[d.status]).join('')
    }

    const latestBody = [...data.bodyRecords].sort((a, b) => b.date.localeCompare(a.date))[0]

    await FitlogWidget.updateData({
      todayIntake: Math.round(todayIntake),
      todayBurned: Math.round(todayBurned),
      latestWeight: latestBody ? latestBody.weight.toFixed(1) : undefined,
      lastUpdated: today,
      ...(streakFields as StreakWidgetFields),
    })
  } catch {
    // ウィジェット非対応環境（web等）では無視
  }
}

let listenerAdded = false

/** ウィジェットのタップで指定された画面（運動画面など）に移動する */
export function initWidgetListeners() {
  if (!isNative || listenerAdded) return
  listenerAdded = true
  const go = (route?: string | null) => {
    if (typeof route === 'string' && route.startsWith('/')) window.location.hash = '#' + route
  }
  // アプリ起動前にタップされた場合
  FitlogWidget.consumeLaunchRoute().then(r => go(r.route)).catch(() => {})
  // アプリ起動中にタップされた場合
  FitlogWidget.addListener('routeRequested', e => go(e.route)).catch(() => {})
}
