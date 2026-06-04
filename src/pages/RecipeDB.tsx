import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronUp, ExternalLink, BookOpen, Sparkles, ChefHat, Link } from 'lucide-react'
import { useRecipeStore } from '../lib/recipedb'
import { analyzeRecipeIngredients, getApiKey } from '../lib/gemini'
import { fetchRecipeFromUrl } from '../lib/recipefetch'
import type { Recipe, RecipeCategory, RecipeIngredient } from '../types'

const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  main:      '主菜',
  side:      '副菜',
  soup:      '汁物',
  staple:    '主食',
  breakfast: '朝食向け',
  snack:     '間食',
}

const CATEGORY_COLORS: Record<RecipeCategory, string> = {
  main:      'bg-orange-100 text-orange-700',
  side:      'bg-green-100 text-green-700',
  soup:      'bg-blue-100 text-blue-700',
  staple:    'bg-yellow-100 text-yellow-700',
  breakfast: 'bg-pink-100 text-pink-700',
  snack:     'bg-purple-100 text-purple-700',
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as RecipeCategory[]

// ── フォームの初期値 ──────────────────────────────────────────
const EMPTY_FORM = {
  name:             '',
  category:         'main' as RecipeCategory,
  tags:             '',
  servings:         1,
  calories:         0,
  protein:          0,
  fat:              0,
  carbs:            0,
  ingredientsText:  '',   // 材料入力テキスト（改行区切り）
  note:             '',
  sourceUrl:        '',
}

type FormState = typeof EMPTY_FORM

function ingredientsToText(items?: RecipeIngredient[]): string {
  if (!items || items.length === 0) return ''
  return items.map(i => `${i.name} ${i.amount}`).join('\n')
}

function toFormState(r: Recipe): FormState {
  return {
    name:            r.name,
    category:        r.category,
    tags:            r.tags.join('、'),
    servings:        r.servings,
    calories:        r.calories,
    protein:         r.protein,
    fat:             r.fat,
    carbs:           r.carbs,
    ingredientsText: ingredientsToText(r.ingredients),
    note:            r.note ?? '',
    sourceUrl:       r.sourceUrl ?? '',
  }
}

// ── 入力フォームモーダル ──────────────────────────────────────
function RecipeFormModal({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: FormState
  onSave: (f: FormState) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [f, setF] = useState<FormState>(initial)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiItems, setAiItems] = useState<{ name: string; amount: string }[]>([])
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  const set = (k: keyof FormState, v: string | number) =>
    setF(prev => ({ ...prev, [k]: v }))

  const hasApiKey = !!getApiKey()
  const valid = f.name.trim() !== '' && f.calories >= 0

  const handleFetchUrl = async () => {
    if (!f.sourceUrl.trim()) return
    setUrlLoading(true)
    setUrlError(null)
    try {
      const fetched = await fetchRecipeFromUrl(f.sourceUrl.trim())
      setF(prev => ({
        ...prev,
        name:            prev.name || fetched.name,
        servings:        fetched.servings,
        ingredientsText: fetched.ingredientsText,
        note:            prev.note || fetched.note,
      }))
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : String(e))
    } finally {
      setUrlLoading(false)
    }
  }

  const handleCalcNutrition = async () => {
    if (!f.ingredientsText.trim()) return
    setAiLoading(true)
    setAiError(null)
    setAiItems([])
    try {
      const result = await analyzeRecipeIngredients(f.ingredientsText, f.servings || 1)
      setF(prev => ({
        ...prev,
        calories: result.calories,
        protein:  result.protein,
        fat:      result.fat,
        carbs:    result.carbs,
      }))
      setAiItems(result.parsedIngredients)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0">
      <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-bold text-gray-800">
          {initial.name ? 'レシピを編集' : 'レシピを登録'}
        </h2>

        {/* URL → 情報取得（最初に置いて料理名を自動入力させる）*/}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Link size={14} className="text-blue-500" />
            <label className="text-xs font-semibold text-blue-700">レシピURL（任意）</label>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 min-w-0 border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white"
              placeholder="https://..."
              value={f.sourceUrl}
              onChange={e => set('sourceUrl', e.target.value)}
            />
            <button
              type="button"
              onClick={handleFetchUrl}
              disabled={urlLoading || !f.sourceUrl.trim()}
              className="shrink-0 flex items-center gap-1 bg-blue-500 text-white rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40 hover:bg-blue-600 transition"
            >
              {urlLoading ? (
                <span className="animate-pulse">取得中...</span>
              ) : (
                <>
                  <Link size={12} />
                  取得
                </>
              )}
            </button>
          </div>
          {urlError && <p className="text-xs text-red-500">{urlError}</p>}
          <p className="text-[10px] text-blue-500">
            URLを入力して「取得」を押すと料理名・材料を自動入力します
          </p>
        </div>

        {/* 料理名 */}
        <div>
          <label className="text-xs text-gray-500 font-medium">料理名 *</label>
          <input
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            placeholder="例: 鶏むね肉のソテー"
            value={f.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>

        {/* カテゴリ */}
        <div>
          <label className="text-xs text-gray-500 font-medium">カテゴリ</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => set('category', c)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition
                  ${f.category === c
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-gray-50 text-gray-500 border-gray-200'}`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* 人数 */}
        <div>
          <label className="text-xs text-gray-500 font-medium">何人前</label>
          <input
            type="number"
            min={1}
            className="mt-1 w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            value={f.servings}
            onChange={e => set('servings', Number(e.target.value))}
          />
          <span className="ml-2 text-xs text-gray-400">人前（栄養値は1人前で保存）</span>
        </div>

        {/* ── 材料入力セクション ── */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <ChefHat size={14} className="text-amber-500" />
            <label className="text-xs font-semibold text-amber-700">材料リスト（任意）</label>
          </div>
          <textarea
            rows={5}
            className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none bg-white"
            placeholder={'例:\n鶏むね肉 200g\nオリーブオイル 大さじ1\nにんにく 1片\n塩 少々\nこしょう 少々'}
            value={f.ingredientsText}
            onChange={e => set('ingredientsText', e.target.value)}
          />
          {hasApiKey ? (
            <button
              type="button"
              onClick={handleCalcNutrition}
              disabled={aiLoading || !f.ingredientsText.trim()}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white rounded-xl py-2 text-xs font-bold disabled:opacity-40 hover:bg-amber-600 transition"
            >
              <Sparkles size={13} className={aiLoading ? 'animate-pulse' : ''} />
              {aiLoading ? 'AI計算中...' : 'AIでカロリー・PFCを計算'}
            </button>
          ) : (
            <p className="text-xs text-amber-600 text-center">設定でAPIキーを登録するとAI計算が使えます</p>
          )}
          {aiError && <p className="text-xs text-red-500">{aiError}</p>}

          {/* AI計算結果の内訳 */}
          {aiItems.length > 0 && (
            <div className="bg-white rounded-xl p-2 border border-amber-100 space-y-1">
              <p className="text-[10px] font-semibold text-amber-600">AI認識結果（{f.servings}人前の合計 ÷ {f.servings} = 1人前）</p>
              {aiItems.map((item, i) => (
                <div key={i} className="flex justify-between text-[10px] text-gray-500">
                  <span>{item.name}</span>
                  <span className="text-gray-400">{item.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 栄養（手動入力 or AI計算後の値） */}
        <div>
          <label className="text-xs text-gray-500 font-medium">栄養素（1人前）</label>
          <div className="grid grid-cols-2 gap-3 mt-1">
            {([
              ['calories', 'カロリー (kcal)', '300'],
              ['protein',  'タンパク質 (g)',  '20'],
              ['fat',      '脂質 (g)',        '10'],
              ['carbs',    '炭水化物 (g)',    '30'],
            ] as [keyof FormState, string, string][]).map(([key, label, ph]) => (
              <div key={key}>
                <label className="text-[10px] text-gray-400">{label}</label>
                <input
                  type="number"
                  min={0}
                  step={key === 'calories' ? 1 : 0.1}
                  placeholder={ph}
                  className="mt-0.5 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                  value={f[key] as number}
                  onChange={e => set(key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* タグ */}
        <div>
          <label className="text-xs text-gray-500 font-medium">タグ（読点区切り）</label>
          <input
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            placeholder="例: 高タンパク、低脂質"
            value={f.tags}
            onChange={e => set('tags', e.target.value)}
          />
        </div>

        {/* メモ */}
        <div>
          <label className="text-xs text-gray-500 font-medium">メモ（任意）</label>
          <textarea
            rows={2}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 resize-none"
            placeholder="調理のポイントなど"
            value={f.note}
            onChange={e => set('note', e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-3 text-sm font-medium"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => valid && onSave(f)}
            disabled={!valid || isSaving}
            className="flex-1 bg-green-500 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-40 hover:bg-green-600 transition"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── レシピカード ──────────────────────────────────────────────
function RecipeCard({
  recipe,
  onEdit,
  onDelete,
}: {
  recipe: Recipe
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex-1 min-w-0 mr-2">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[recipe.category]}`}>
              {CATEGORY_LABELS[recipe.category]}
            </span>
            {recipe.tags.map(t => (
              <span key={t} className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
          <p className="text-sm font-semibold text-gray-800 truncate">{recipe.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-green-600">{recipe.calories}kcal</span>
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {/* 栄養 */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span>P <b className="text-blue-500">{recipe.protein}g</b></span>
            <span>F <b className="text-yellow-500">{recipe.fat}g</b></span>
            <span>C <b className="text-orange-500">{recipe.carbs}g</b></span>
            <span className="ml-auto text-gray-400">{recipe.servings}人前</span>
          </div>

          {/* 材料 */}
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">材料（{recipe.servings}人前）</p>
              <ul className="space-y-0.5">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="flex justify-between text-xs text-gray-500">
                    <span>{ing.name}</span>
                    <span className="text-gray-400">{ing.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* メモ */}
          {recipe.note && (
            <p className="text-xs text-gray-500">{recipe.note}</p>
          )}

          {/* URL */}
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              <ExternalLink size={11} />
              レシピを見る
            </a>
          )}

          {/* 操作 */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onEdit}
              className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition"
            >
              <Pencil size={12} /> 編集
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1 text-xs text-red-400 border border-red-100 rounded-lg px-3 py-1.5 hover:bg-red-50 transition"
            >
              <Trash2 size={12} /> 削除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── メインページ ──────────────────────────────────────────────
export default function RecipeDBPage() {
  const navigate = useNavigate()
  const { db, isLoading, isSaving, error, loadDB, addRecipe, updateRecipe, deleteRecipe } = useRecipeStore()

  const [filterCat, setFilterCat] = useState<RecipeCategory | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Recipe | null>(null)

  useEffect(() => {
    loadDB()
  }, [loadDB])

  const filtered = filterCat === 'all'
    ? db.recipes
    : db.recipes.filter(r => r.category === filterCat)

  const sortedFiltered = [...filtered].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )

  function formStateToRecipe(f: FormState): Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> {
    // 材料テキストを行ごとに分割して RecipeIngredient[] に変換
    const ingredients: RecipeIngredient[] = f.ingredientsText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        // 最後の空白区切りトークンを量、それ以前を名前とみなす
        const parts = line.split(/\s+/)
        if (parts.length === 1) return { name: parts[0], amount: '' }
        const amount = parts[parts.length - 1]
        const name   = parts.slice(0, -1).join(' ')
        return { name, amount }
      })

    return {
      name:        f.name.trim(),
      category:    f.category,
      tags:        f.tags.split(/[、,，]/).map(t => t.trim()).filter(Boolean),
      servings:    f.servings,
      calories:    f.calories,
      protein:     f.protein,
      fat:         f.fat,
      carbs:       f.carbs,
      ingredients: ingredients.length > 0 ? ingredients : undefined,
      note:        f.note.trim() || undefined,
      sourceUrl:   f.sourceUrl.trim() || undefined,
    }
  }

  const handleSave = async (f: FormState) => {
    if (editTarget) {
      await updateRecipe(editTarget.id, formStateToRecipe(f))
    } else {
      await addRecipe(formStateToRecipe(f))
    }
    setShowForm(false)
    setEditTarget(null)
  }

  const handleEdit = (r: Recipe) => {
    setEditTarget(r)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('このレシピを削除しますか？')) {
      await deleteRecipe(id)
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
          <BookOpen size={18} className="text-green-500" />
          レシピDB
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {isSaving && <span className="text-xs text-gray-400">保存中...</span>}
          <span className="text-xs text-gray-400">{db.recipes.length}件</span>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 text-red-500 text-xs rounded-xl px-4 py-3">{error}</div>
      )}

      {/* カテゴリフィルター */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setFilterCat('all')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition
            ${filterCat === 'all' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-500 border-gray-200'}`}
        >
          すべて
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition
              ${filterCat === c ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-500 border-gray-200'}`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* 新規追加ボタン */}
      <button
        onClick={() => { setEditTarget(null); setShowForm(true) }}
        className="w-full bg-green-500 text-white rounded-2xl py-3 font-bold flex items-center justify-center gap-2 hover:bg-green-600 transition active:scale-95"
      >
        <Plus size={18} />
        レシピを登録する
      </button>

      {/* ローディング */}
      {isLoading && (
        <p className="text-center text-sm text-gray-400 py-8">読み込み中...</p>
      )}

      {/* レシピ一覧 */}
      {!isLoading && sortedFiltered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🍳</p>
          <p className="text-sm">レシピがまだありません</p>
          <p className="text-sm">「レシピを登録する」から追加してください</p>
        </div>
      )}

      <div className="space-y-3">
        {sortedFiltered.map(r => (
          <RecipeCard
            key={r.id}
            recipe={r}
            onEdit={() => handleEdit(r)}
            onDelete={() => handleDelete(r.id)}
          />
        ))}
      </div>

      {/* フォームモーダル */}
      {showForm && (
        <RecipeFormModal
          initial={editTarget ? toFormState(editTarget) : EMPTY_FORM}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTarget(null) }}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}
