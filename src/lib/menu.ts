import type { LucideIcon } from 'lucide-react'
import { CalendarDays, BarChart2, ChefHat, BookOpen, ShoppingCart, Settings } from 'lucide-react'

export interface MenuItem {
  to: string
  icon: LucideIcon
  label: string
  description: string
  /** アイコンの背景・文字色（Tailwind クラス） */
  tone: string
}

export interface MenuGroup {
  title: string
  items: MenuItem[]
}

/** メニュー画面に並べる項目。下部タブにない画面はすべてここから開く */
export const MENU_GROUPS: MenuGroup[] = [
  {
    title: '振り返り',
    items: [
      { to: '/calendar', icon: CalendarDays, label: 'カレンダー', description: '日ごとの記録を見る', tone: 'bg-sky-50 text-sky-500' },
      { to: '/report', icon: BarChart2, label: 'レポート', description: 'グラフ・エクスポート', tone: 'bg-indigo-50 text-indigo-500' },
    ],
  },
  {
    title: 'ごはんの準備',
    items: [
      { to: '/mealplan', icon: ChefHat, label: '献立', description: 'AIで5日分を作る', tone: 'bg-amber-50 text-amber-500' },
      { to: '/recipedb', icon: BookOpen, label: 'レシピ', description: '登録したレシピ', tone: 'bg-orange-50 text-orange-500' },
      { to: '/shoppinglist', icon: ShoppingCart, label: '買い物リスト', description: '献立から自動作成', tone: 'bg-emerald-50 text-emerald-500' },
    ],
  },
  {
    title: 'アプリ',
    items: [
      { to: '/settings', icon: Settings, label: '設定', description: '目標・通知・連携', tone: 'bg-gray-100 text-gray-500' },
    ],
  },
]

/** メニューから開く画面のパス（下部タブの「メニュー」を選択中にする判定に使う） */
export const MENU_PATHS = ['/menu', ...MENU_GROUPS.flatMap(g => g.items.map(i => i.to))]
