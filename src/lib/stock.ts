import { create } from 'zustand'
import { callProxy, isRecipeProxyConfigured } from './recipeproxy'
import type { StockReminderSettings } from '../types'

// 日用品の在庫（家計簿スプレッドシート）を GAS 中継の stockStatus で読む。読むだけで書き込まない。
// 数の更新や棚卸しは家計簿GASの在庫アプリ（appUrl）で行う

export interface StockLowItem {
  name: string
  count: number
  min: number
  place: string
  url: string   // Amazon の商品URL（未設定なら空）
}

export interface StocktakePlace {
  place: string
  placeId: string
  itemCount: number
  lastChecked: string | null   // YYYY-MM-DD。未確認の品目があれば null
}

export interface StockStatus {
  appUrl: string
  low: StockLowItem[]
  stocktake: StocktakePlace | null
  fetchedAt: string
}

const STORAGE_KEY = 'fitlog-stock'
// アプリを開くたびに読み直さないよう、この間隔より新しければ使い回す
const REFRESH_INTERVAL_MS = 30 * 60 * 1000

export function isStockConfigured(): boolean {
  return isRecipeProxyConfigured()
}

/** 前回読んだ在庫の状況（通知の予約にも使う） */
export function loadStockStatus(): StockStatus | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StockStatus) : null
  } catch {
    return null
  }
}

export function resolveStockReminder(s?: StockReminderSettings): StockReminderSettings {
  return { enabled: true, stocktakeDay: 6, stocktakeTime: '10:00', ...s }
}

/** 在庫アプリのURL。placeId を付けるとその保管場所だけの棚卸し画面になる */
export function stockAppUrl(status: StockStatus, placeId?: string): string {
  return placeId ? `${status.appUrl}?place=${encodeURIComponent(placeId)}` : status.appUrl
}

export function amazonUrl(item: StockLowItem): string {
  return item.url || `https://www.amazon.co.jp/s?k=${encodeURIComponent(item.name)}`
}

/** NFC タグ（fitlog://stock?item=T01）から開いた品目 */
export interface StockItem {
  id: string
  name: string
  place: string
  count: number | null   // 未棚卸しなら null
  min: number
  step: number           // 「使った」1回で減る数
  url: string
  appUrl: string
}

export async function fetchStockItem(id: string): Promise<StockItem> {
  const res = await callProxy<StockItem>({ action: 'stockItem', id })
  if (!res.ok) throw new Error(res.error)
  return res.data
}

/** 在庫を増減する（在庫ログに残る）。reason は「使った」か「取り消し」 */
export async function changeStockItem(id: string, delta: number, reason: '使った' | '取り消し'): Promise<StockItem> {
  const res = await callProxy<StockItem>({ action: 'stockChange', id, delta, reason })
  if (!res.ok) throw new Error(res.error)
  return res.data
}

interface StockStore {
  status: StockStatus | null
  error: string | null
  loading: boolean
  /** 読み直す。新しい状況を読めたらそれを、読まなかった・失敗したら null を返す */
  refresh: (force?: boolean) => Promise<StockStatus | null>
}

export const useStockStore = create<StockStore>((set, get) => ({
  status: loadStockStatus(),
  error: null,
  loading: false,

  refresh: async (force = false) => {
    if (!isStockConfigured() || get().loading) return null
    const current = get().status
    if (!force && current && Date.now() - Date.parse(current.fetchedAt) < REFRESH_INTERVAL_MS) return null
    set({ loading: true })
    try {
      const res = await callProxy<StockStatus>({ action: 'stockStatus' })
      if (!res.ok) throw new Error(res.error)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data)) } catch { /* 保存できなくても表示はする */ }
      set({ status: res.data, error: null })
      return res.data
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      return null
    } finally {
      set({ loading: false })
    }
  },
}))
