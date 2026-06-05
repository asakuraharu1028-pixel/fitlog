import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, ShoppingCart, ChevronDown, ChevronUp, BookOpen, HelpCircle } from 'lucide-react'
import { buildShoppingList, loadShoppingList } from '../lib/shoppinglist'
import { useRecipeStore } from '../lib/recipedb'
import { loadSavedMealPlan } from '../lib/mealplan'
import type { ShoppingListData, ShoppingCategoryGroup } from '../types'

const CATEGORY_ICONS: Record<string, string> = {
  '肉類':      '🥩',
  '魚介類':    '🐟',
  '野菜':      '🥦',
  'きのこ類':  '🍄',
  '豆腐・大豆': '🫘',
  '卵・乳製品': '🥚',
  '穀物・麺類': '🍚',
  '調味料・油': '🧂',
  'その他':    '🛒',
}

function CategorySection({ group }: { group: ShoppingCategoryGroup }) {
  const [open, setOpen] = useState(true)
  const icon = CATEGORY_ICONS[group.category] ?? '🛒'

  return (
    <div className="mb-2">
      <button
        className="w-full flex items-center justify-between py-1.5 px-1"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-sm font-bold text-gray-700">
          {icon} {group.category}
          <span className="ml-2 text-xs font-normal text-gray-400">{group.items.length}品</span>
        </span>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && (
        <ul className="pl-2 space-y-1">
          {group.items.map((item, i) => (
            <li key={i} className="flex items-baseline justify-between py-1 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{item.name}</span>
              <span className="text-xs text-gray-500 ml-2 shrink-0">
                {item.amount}
                <span className="text-gray-300 ml-1">（{item.fromRecipe}）</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ListSection({
  title,
  icon: Icon,
  color,
  groups,
}: {
  title: string
  icon: React.ElementType
  color: string
  groups: ShoppingCategoryGroup[]
}) {
  const total = groups.reduce((s, g) => s + g.items.length, 0)

  if (groups.length === 0) {
    return (
      <div className={`rounded-2xl border ${color} px-4 py-3`}>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={16} />
          <h2 className="text-sm font-bold">{title}</h2>
        </div>
        <p className="text-xs text-gray-400">対象の食材がありません</p>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl border ${color} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} />
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="ml-auto text-xs text-gray-400">計 {total}品</span>
      </div>
      {groups.map(g => (
        <CategorySection key={g.category} group={g} />
      ))}
    </div>
  )
}

export default function ShoppingList() {
  const navigate = useNavigate()
  const { db: recipeDB, loadDB } = useRecipeStore()

  const [list, setList] = useState<ShoppingListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasPlan, setHasPlan] = useState(true)

  useEffect(() => {
    loadDB()
    loadShoppingList()
      .then(saved => { if (saved) setList(saved) })
      .finally(() => setLoading(false))
  }, [loadDB])

  const handleGenerate = async () => {
    setError(null)
    setGenerating(true)
    try {
      const plan = await loadSavedMealPlan()
      if (!plan) {
        setHasPlan(false)
        return
      }
      const result = await buildShoppingList(plan, recipeDB.recipes)
      setList(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 transition">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <ShoppingCart size={18} className="text-green-500" />
          買い物リスト
        </h1>
        {list && (
          <p className="ml-auto text-xs text-gray-400">
            {new Date(list.generatedAt).toLocaleDateString('ja-JP')}
          </p>
        )}
      </div>

      {/* 献立なし警告 */}
      {!hasPlan && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-center">
          <p className="text-sm text-amber-700 font-medium mb-1">献立が作成されていません</p>
          <button
            onClick={() => navigate('/mealplan')}
            className="mt-2 text-sm text-amber-700 underline"
          >
            献立プランへ
          </button>
        </div>
      )}

      {/* 生成ボタン */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full bg-green-500 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-green-600 transition active:scale-95"
      >
        {generating ? (
          <>
            <RefreshCw size={18} className="animate-spin" />
            買い物リストを作成中...（少し時間がかかります）
          </>
        ) : (
          <>
            <ShoppingCart size={18} />
            {list ? '買い物リストを再作成' : '買い物リストを作成'}
          </>
        )}
      </button>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 text-red-500 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* ローディング */}
      {loading && (
        <p className="text-center text-sm text-gray-400 py-8">読み込み中...</p>
      )}

      {/* リスト表示 */}
      {list && !loading && (
        <div className="space-y-4">
          <ListSection
            title="DBレシピ 買い物リスト"
            icon={BookOpen}
            color="border-green-200 bg-green-50"
            groups={list.dbList}
          />
          <ListSection
            title="その他 買い物リスト"
            icon={HelpCircle}
            color="border-blue-200 bg-blue-50"
            groups={list.otherList}
          />
        </div>
      )}

      {/* 未生成 */}
      {!list && !loading && !generating && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🛒</p>
          <p className="text-sm">献立から買い物リストを自動作成します</p>
          <p className="text-xs mt-1 text-gray-300">DBレシピはそのまま、未登録料理はAIが材料を補完</p>
        </div>
      )}
    </div>
  )
}
