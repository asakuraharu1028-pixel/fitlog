import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, ShoppingCart, ChevronDown, ChevronUp,
  BookOpen, HelpCircle, X,
} from 'lucide-react'
import { buildShoppingList, loadShoppingList } from '../lib/shoppinglist'
import { useRecipeStore } from '../lib/recipedb'
import { loadSavedMealPlan } from '../lib/mealplan'
import type { ShoppingListData, ShoppingCategoryGroup, ShoppingIngredient } from '../types'

// ── チェック状態をlocalStorageで永続化 ──────────────────────
const CHECKED_KEY = 'fitlog-shopping-checked'

function loadChecked(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECKED_KEY)
    return new Set(raw ? JSON.parse(raw) as string[] : [])
  } catch { return new Set() }
}
function saveChecked(set: Set<string>) {
  localStorage.setItem(CHECKED_KEY, JSON.stringify([...set]))
}

// ── 数量と単位をきれいに表示 ────────────────────────────────
// "500g" → "500g"  "大さじ2" → "大さじ2"  そのまま返す
function formatAmount(amount: string) {
  return amount || '適量'
}

// ── レシピ一覧ポップアップ ───────────────────────────────────
function RecipePopup({ ingredient, onClose }: { ingredient: ShoppingIngredient; onClose: () => void }) {
  const recipes = ingredient.fromRecipe.split('・').filter(Boolean)
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-bold text-gray-800">
            {ingredient.name}
            <span className="ml-2 text-green-600 font-normal text-sm">{formatAmount(ingredient.amount)}</span>
          </p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-2">使用レシピ</p>
        <ul className="space-y-2">
          {recipes.map((r, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-gray-700 py-2 border-b border-gray-50 last:border-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── 食材1行 ──────────────────────────────────────────────────
function IngredientRow({
  item,
  itemKey,
  checked,
  onToggle,
  onTap,
}: {
  item: ShoppingIngredient
  itemKey: string
  checked: boolean
  onToggle: () => void
  onTap: () => void
}) {
  return (
    <li className={`flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 ${checked ? 'opacity-40' : ''}`}>
      {/* チェックボックス */}
      <button
        onClick={onToggle}
        className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition
          ${checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}
      >
        {checked && <span className="text-white text-[10px] font-bold">✓</span>}
      </button>

      {/* 食材名 */}
      <span className={`flex-1 text-sm ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
        {item.name}
      </span>

      {/* 数量（数値と単位を隣接） */}
      <span className="text-sm font-medium text-gray-600 shrink-0">
        {formatAmount(item.amount)}
      </span>

      {/* レシピ一覧ボタン */}
      <button
        onClick={onTap}
        className="shrink-0 text-[10px] text-gray-400 hover:text-green-500 transition px-1"
        title="使用レシピを見る"
      >
        ▶
      </button>
    </li>
  )
}

// ── カテゴリセクション ───────────────────────────────────────
const CATEGORY_ICONS: Record<string, string> = {
  '肉類':       '🥩',
  '魚介類':     '🐟',
  '野菜':       '🥦',
  'きのこ類':   '🍄',
  '豆腐・大豆': '🫘',
  '卵・乳製品': '🥚',
  '穀物・麺類': '🍚',
  '調味料・油': '🧂',
  'その他':     '🛒',
}

function CategorySection({
  group,
  checked,
  onToggle,
  onTapItem,
}: {
  group: ShoppingCategoryGroup
  checked: Set<string>
  onToggle: (key: string) => void
  onTapItem: (item: ShoppingIngredient) => void
}) {
  const [open, setOpen] = useState(true)
  const icon = CATEGORY_ICONS[group.category] ?? '🛒'
  const doneCount = group.items.filter(it => checked.has(`${group.category}:${it.name}`)).length

  return (
    <div className="mb-1">
      <button
        className="w-full flex items-center justify-between py-2 px-1"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-sm font-bold text-gray-700">
          {icon} {group.category}
        </span>
        <span className="flex items-center gap-2 text-xs text-gray-400">
          {doneCount > 0 && <span className="text-green-500">{doneCount}✓</span>}
          <span>{group.items.length}品</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <ul className="pl-1">
          {group.items.map(item => {
            const key = `${group.category}:${item.name}`
            return (
              <IngredientRow
                key={key}
                item={item}
                itemKey={key}
                checked={checked.has(key)}
                onToggle={() => onToggle(key)}
                onTap={() => onTapItem(item)}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── リストセクション（DBレシピ / その他） ─────────────────────
function ListSection({
  title,
  icon: Icon,
  color,
  groups,
  checked,
  onToggle,
  onTapItem,
}: {
  title: string
  icon: React.ElementType
  color: string
  groups: ShoppingCategoryGroup[]
  checked: Set<string>
  onToggle: (key: string) => void
  onTapItem: (item: ShoppingIngredient) => void
}) {
  const total    = groups.reduce((s, g) => s + g.items.length, 0)
  const doneTotal = groups.reduce(
    (s, g) => s + g.items.filter(it => checked.has(`${g.category}:${it.name}`)).length, 0
  )

  if (groups.length === 0) return (
    <div className={`rounded-2xl border ${color} px-4 py-3`}>
      <div className="flex items-center gap-2">
        <Icon size={15} />
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      <p className="text-xs text-gray-400 mt-1">対象の食材がありません</p>
    </div>
  )

  return (
    <div className={`rounded-2xl border ${color} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} />
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="ml-auto text-xs text-gray-400">
          {doneTotal > 0 && <span className="text-green-500 mr-1">{doneTotal}✓ /</span>}
          計 {total}品
        </span>
      </div>
      {groups.map(g => (
        <CategorySection
          key={g.category}
          group={g}
          checked={checked}
          onToggle={onToggle}
          onTapItem={onTapItem}
        />
      ))}
    </div>
  )
}

// ── メインページ ──────────────────────────────────────────────
export default function ShoppingList() {
  const navigate = useNavigate()
  const { db: recipeDB, loadDB } = useRecipeStore()

  const [list,       setList]       = useState<ShoppingListData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [hasPlan,    setHasPlan]    = useState(true)
  const [checked,    setChecked]    = useState<Set<string>>(loadChecked)
  const [popup,      setPopup]      = useState<ShoppingIngredient | null>(null)

  useEffect(() => { loadDB() }, [loadDB])

  useEffect(() => {
    loadShoppingList()
      .then(saved => { if (saved) setList(saved) })
      .finally(() => setLoading(false))
  }, [])

  const toggleChecked = useCallback((key: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      saveChecked(next)
      return next
    })
  }, [])

  const handleGenerate = async () => {
    setError(null)
    setGenerating(true)
    try {
      const plan = await loadSavedMealPlan()
      if (!plan) { setHasPlan(false); return }
      const result = await buildShoppingList(plan, recipeDB.recipes)
      setList(result)
      setChecked(new Set())
      saveChecked(new Set())
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
          <p className="text-sm text-amber-700 font-medium">献立が作成されていません</p>
          <button onClick={() => navigate('/mealplan')} className="mt-2 text-sm text-amber-700 underline">
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
          <><RefreshCw size={18} className="animate-spin" />買い物リストを作成中...</>
        ) : (
          <><ShoppingCart size={18} />{list ? '買い物リストを再作成' : '買い物リストを作成'}</>
        )}
      </button>

      {error && <div className="bg-red-50 text-red-500 text-sm rounded-xl px-4 py-3">{error}</div>}
      {loading && <p className="text-center text-sm text-gray-400 py-8">読み込み中...</p>}

      {/* リスト */}
      {list && !loading && (
        <div className="space-y-4">
          <ListSection
            title="DBレシピ 買い物リスト"
            icon={BookOpen}
            color="border-green-200 bg-green-50"
            groups={list.dbList}
            checked={checked}
            onToggle={toggleChecked}
            onTapItem={setPopup}
          />
          <ListSection
            title="その他 買い物リスト"
            icon={HelpCircle}
            color="border-blue-200 bg-blue-50"
            groups={list.otherList}
            checked={checked}
            onToggle={toggleChecked}
            onTapItem={setPopup}
          />
        </div>
      )}

      {/* 未生成 */}
      {!list && !loading && !generating && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🛒</p>
          <p className="text-sm">献立から買い物リストを自動作成します</p>
          <p className="text-xs mt-1 text-gray-300">DBレシピはそのまま・未登録料理はAIが材料を補完</p>
        </div>
      )}

      {/* レシピポップアップ */}
      {popup && <RecipePopup ingredient={popup} onClose={() => setPopup(null)} />}
    </div>
  )
}
