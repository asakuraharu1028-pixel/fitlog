import { nanoid } from 'nanoid'
import type { AppData, CareItem, CareLog } from '../types'
import { localDateStr } from './utils'

/** 既定のセルフケア項目。最初はすべて「お休み」にしておき、ユーザーが1つ選んで始める */
export const DEFAULT_CARE_ITEMS: CareItem[] = [
  {
    id: 'teeth_night', icon: '🪥', label: '夜の歯磨き',
    anchor: '寝る前にスマホを充電器につないだら', minimum: '1本だけ磨く', full: '全部の歯を2分',
    status: 'paused', reminderTime: '22:30',
  },
  {
    id: 'teeth_morning', icon: '🦷', label: '朝の歯磨き',
    anchor: '朝の飲み物を用意したら', minimum: '1本だけ磨く', full: '全部の歯を2分',
    status: 'paused', reminderTime: '08:00',
  },
  {
    id: 'bath', icon: '🛁', label: '入浴',
    anchor: '帰宅して部屋着に着替えたら', minimum: 'シャワー3分', full: '湯船・髪と体を洗う',
    status: 'paused', reminderTime: '21:00',
  },
  {
    id: 'skincare', icon: '🧴', label: 'スキンケア',
    anchor: '歯磨きが終わったら', minimum: 'オールインワンを1回塗る', full: '化粧水・乳液まで',
    status: 'paused', reminderTime: '22:45',
  },
]

/** 既定のアイコン候補（自分で項目を足すとき用） */
export const CARE_ICONS = ['🪥', '🦷', '🛁', '🚿', '🧴', '💆', '💅', '🧼', '💊', '💧', '🛏️', '🧹']

/** 保存済みの項目、なければ既定の項目 */
export function resolveCareItems(data: AppData): CareItem[] {
  return data.settings.careItems ?? DEFAULT_CARE_ITEMS
}

export function newCareItem(): CareItem {
  return {
    id: 'care_' + nanoid(8), icon: '🧼', label: '新しい項目',
    anchor: '', minimum: '', full: '', status: 'paused', reminderTime: '21:00',
  }
}

export function careLogOn(data: AppData, itemId: string, date: string): CareLog | undefined {
  return (data.careLogs ?? []).find(l => l.itemId === itemId && l.date === date)
}

/**
 * タップしたときの保存差分を作る。
 * 1項目1日1件。未記録なら記録、別のレベルならレベルを変更、同じレベルなら取り消し。
 */
export function buildCareToggle(
  data: AppData, itemId: string, level: CareLog['level'], date: string = localDateStr(),
): Pick<AppData, 'careLogs'> {
  const logs = data.careLogs ?? []
  const existing = logs.find(l => l.itemId === itemId && l.date === date)
  if (existing && existing.level === level) {
    return { careLogs: logs.filter(l => l.id !== existing.id) }
  }
  if (existing) {
    return { careLogs: logs.map(l => (l.id === existing.id ? { ...l, level } : l)) }
  }
  const log: CareLog = { id: nanoid(), date, itemId, level, createdAt: new Date().toISOString() }
  return { careLogs: [...logs, log] }
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

export interface CareStats {
  /** 直近7日（古い順） */
  recent: { date: string; level: CareLog['level'] | null }[]
  /** 直近7日でできた日数 */
  last7: number
  /** 直近28日の実施率（0〜1）。始めてから28日経っていない場合は始めた日からの割合 */
  rate28: number
  /** rate28 の分母になった日数 */
  days28: number
}

/**
 * 連続日数ではなく「何日できたか」で見る。1日抜けても数字が崩れないので、やめるきっかけになりにくい。
 * 今日はまだ終わっていないので、未記録なら分母に入れない。
 */
export function computeCareStats(data: AppData, itemId: string, today: string = localDateStr()): CareStats {
  const byDate = new Map<string, CareLog['level']>()
  for (const l of data.careLogs ?? []) {
    if (l.itemId === itemId) byDate.set(l.date, l.level)
  }

  const recent = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6)
    return { date, level: byDate.get(date) ?? null }
  })

  const first = [...byDate.keys()].sort()[0]
  let done = 0
  let days = 0
  for (let i = 0; i < 28; i++) {
    const date = addDays(today, -i)
    if (first && date < first) break
    if (date === today && !byDate.has(date)) continue
    days++
    if (byDate.has(date)) done++
  }

  return {
    recent,
    last7: recent.filter(r => r.level).length,
    rate28: days > 0 ? done / days : 0,
    days28: days,
  }
}
