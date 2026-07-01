import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronUp, ExternalLink, BookOpen, Sparkles, ChefHat, Link, UtensilsCrossed, Search, X, ImagePlus } from 'lucide-react'
import { useRecipeStore } from '../lib/recipedb'
import { analyzeRecipeIngredients, getApiKey, stripGroupLabels } from '../lib/gemini'
import { fetchRecipeFromUrl, extractRecipeFromImage } from '../lib/recipefetch'
import { uploadImageToDrive, loadImageUrlFromDrive, deleteFileFromDrive } from '../lib/google'
import type { Recipe, RecipeCategory, RecipeIngredient } from '../types'
import type { AiFoodResult } from '../lib/gemini'

// 画像本体は別Driveファイルで保存する。保存時に反映すべき変更内容を表す
type PendingImage =
  | { kind: 'keep' }
  | { kind: 'set'; base64: string; mimeType: string }
  | { kind: 'remove' }

function recipeToEntry(r: Recipe): AiFoodResult {
  return {
    name: r.name,
    grams: 0,
    calories: r.calories,
    protein: r.protein,
    fat: r.fat,
    carbs: r.carbs,
    // 食塩相当量(g) → Na(mg)
    na: r.sodium != null ? Math.round(r.sodium * 393) : 0,
    fiber: 0, vitA: 0, vitC: 0, vitD: 0, ca: 0, fe: 0,
  }
}

const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  main:      '主菜',
  side:      '副菜',
  soup:      '汁物',
  staple:    '主食',
  breakfast: '朝食向け',
  snack:     '間食',
  bento:     '弁当',
}

const CATEGORY_COLORS: Record<RecipeCategory, string> = {
  main:      'bg-orange-100 text-orange-700',
  side:      'bg-green-100 text-green-700',
  soup:      'bg-blue-100 text-blue-700',
  staple:    'bg-yellow-100 text-yellow-700',
  breakfast: 'bg-pink-100 text-pink-700',
  snack:     'bg-purple-100 text-purple-700',
  bento:     'bg-amber-100 text-amber-700',
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
  sodium:           0,   // 食塩相当量 g
  ingredientsText:  '',   // 材料入力テキスト（改行区切り）
  note:             '',
  sourceUrl:        '',
  imageFileId:      '',    // 既存レシピの画像ファイルID（保存済み）
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
    sodium:          r.sodium ?? 0,
    ingredientsText: stripGroupLabels(ingredientsToText(r.ingredients)),
    note:            r.note ?? '',
    sourceUrl:       r.sourceUrl ?? '',
    imageFileId:     r.imageFileId ?? '',
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
  onSave: (f: FormState, image: PendingImage) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [f, setF] = useState<FormState>(initial)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiItems, setAiItems] = useState<{ name: string; amount: string }[]>([])
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  // ── 画像状態 ──
  // newImage: 新しく選んだ画像（未保存）。imgPreview: プレビュー表示用URL。
  const [newImage, setNewImage] = useState<{ base64: string; mimeType: string } | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [imgRemoved, setImgRemoved] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)
  const [imgExtractLoading, setImgExtractLoading] = useState(false)
  const isWeb = Capacitor.getPlatform() === 'web'

  const set = (k: keyof FormState, v: string | number) =>
    setF(prev => ({ ...prev, [k]: v }))

  const hasApiKey = !!getApiKey()
  const valid = f.name.trim() !== '' && f.calories >= 0

  // 編集時、既存の保存済み画像をDriveから読み込んでプレビュー表示
  useEffect(() => {
    if (!initial.imageFileId) return
    let revoked = false
    let url: string | null = null
    loadImageUrlFromDrive(initial.imageFileId)
      .then(u => { if (!revoked) { url = u; setImgPreview(u) } })
      .catch(() => { /* 表示できなくても致命的ではない */ })
    return () => { revoked = true; if (url) URL.revokeObjectURL(url) }
  }, [initial.imageFileId])

  // 保存時に渡す画像変更内容を組み立てる
  const buildPendingImage = (): PendingImage => {
    if (newImage) return { kind: 'set', base64: newImage.base64, mimeType: newImage.mimeType }
    if (imgRemoved && initial.imageFileId) return { kind: 'remove' }
    return { kind: 'keep' }
  }

  // カメラ/ギャラリーから画像を選択（ネイティブ）
  const handlePickImage = async () => {
    setImgError(null)
    try {
      const photo = await CapCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        correctOrientation: true,
      })
      if (!photo.dataUrl) return
      setNewImage({ base64: photo.dataUrl.split(',')[1], mimeType: `image/${photo.format}` })
      setImgPreview(photo.dataUrl)
      setImgRemoved(false)
    } catch {
      // キャンセルは無視
    }
  }

  // ファイル選択（web: Capacitor CameraはPWA elements未導入で無反応のため input を使う）
  const handleWebFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImgError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setNewImage({ base64: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg' })
      setImgPreview(dataUrl)
      setImgRemoved(false)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setNewImage(null)
    setImgPreview(null)
    setImgRemoved(true)
  }

  // 選択中の画像からAIで料理名・材料を読み取ってフォームに反映
  const handleExtractFromImage = async () => {
    if (!newImage) return
    setImgExtractLoading(true)
    setImgError(null)
    try {
      const fetched = await extractRecipeFromImage(newImage.base64, newImage.mimeType)
      setF(prev => ({
        ...prev,
        name:            prev.name || fetched.name,
        servings:        fetched.servings,
        ingredientsText: fetched.ingredientsText,
        note:            prev.note || fetched.note,
      }))
    } catch (e) {
      setImgError(e instanceof Error ? e.message : String(e))
    } finally {
      setImgExtractLoading(false)
    }
  }

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
        sodium:   result.sodium,
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

        {/* レシピ画像 → 情報取得＆画像保存 */}
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <ImagePlus size={14} className="text-rose-500" />
            <label className="text-xs font-semibold text-rose-700">レシピ画像（任意）</label>
          </div>

          {imgPreview ? (
            <div className="relative">
              <img src={imgPreview} alt="レシピ" className="w-full rounded-xl object-cover max-h-48" />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>
          ) : isWeb ? (
            <label className="w-full border-2 border-dashed border-rose-200 rounded-xl py-6 flex flex-col items-center gap-1.5 text-rose-500 hover:bg-rose-100/60 transition cursor-pointer">
              <ImagePlus size={26} />
              <span className="text-xs">クリックして写真を選択</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleWebFileChange} />
            </label>
          ) : (
            <button
              type="button"
              onClick={handlePickImage}
              className="w-full border-2 border-dashed border-rose-200 rounded-xl py-6 flex flex-col items-center gap-1.5 text-rose-500 hover:bg-rose-100/60 transition"
            >
              <ImagePlus size={26} />
              <span className="text-xs">タップして写真を選択</span>
            </button>
          )}

          {/* 新しく選んだ画像のみAI読み取り可能（保存済み画像はテキスト化済みの想定）*/}
          {newImage && (
            hasApiKey ? (
              <button
                type="button"
                onClick={handleExtractFromImage}
                disabled={imgExtractLoading}
                className="w-full flex items-center justify-center gap-2 bg-rose-500 text-white rounded-xl py-2 text-xs font-bold disabled:opacity-40 hover:bg-rose-600 transition"
              >
                <Sparkles size={13} className={imgExtractLoading ? 'animate-pulse' : ''} />
                {imgExtractLoading ? 'AI読み取り中...' : 'この画像から料理名・材料を読み取る'}
              </button>
            ) : (
              <p className="text-xs text-rose-600 text-center">設定でAPIキーを登録するとAI読み取りが使えます</p>
            )
          )}
          {imgError && <p className="text-xs text-red-500">{imgError}</p>}
          <p className="text-[10px] text-rose-500">
            写真を選ぶとAIで材料を読み取れます。画像はレシピと一緒に保存され、あとで見返せます
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
              ['sodium',   '食塩相当量 (g)',  '1.5'],
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
            onClick={() => valid && onSave(f, buildPendingImage())}
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

// ── Drive上の画像を遅延ロードして表示 ─────────────────────────
function DriveImage({ fileId }: { fileId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoked = false
    let objUrl: string | null = null
    loadImageUrlFromDrive(fileId)
      .then(u => { if (!revoked) { objUrl = u; setUrl(u) } })
      .catch(() => {})
    return () => { revoked = true; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [fileId])

  if (!url) {
    return <div className="w-full h-32 rounded-xl bg-gray-100 animate-pulse" />
  }
  return <img src={url} alt="レシピ" className="w-full rounded-xl object-cover max-h-48" />
}

// ── レシピカード ──────────────────────────────────────────────
function RecipeCard({
  recipe,
  onEdit,
  onDelete,
  onAddMeal,
  selectable,
  selected,
  onToggleSelect,
}: {
  recipe: Recipe
  onEdit: () => void
  onDelete: () => void
  onAddMeal: () => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden ${selectable && selected ? 'ring-2 ring-green-400' : ''}`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition text-left"
        onClick={() => selectable ? onToggleSelect?.() : setOpen(v => !v)}
      >
        {selectable && (
          <div className={`w-5 h-5 rounded-full border-2 shrink-0 mr-3 flex items-center justify-center transition ${selected ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
            {selected && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        )}
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
          {!selectable && (open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />)}
        </div>
      </button>

      {!selectable && open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {/* レシピ画像 */}
          {recipe.imageFileId && <DriveImage fileId={recipe.imageFileId} />}

          {/* 栄養 */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span>P <b className="text-blue-500">{recipe.protein}g</b></span>
            <span>F <b className="text-yellow-500">{recipe.fat}g</b></span>
            <span>C <b className="text-orange-500">{recipe.carbs}g</b></span>
            {recipe.sodium != null && recipe.sodium > 0 && (
              <span>塩 <b className="text-gray-600">{recipe.sodium}g</b></span>
            )}
            <span className="ml-auto text-gray-400">{recipe.servings}人前</span>
          </div>

          {/* 材料 */}
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">材料（{recipe.servings}人前）</p>
              <ul className="space-y-0.5">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="text-xs text-gray-500">
                    {ing.name}
                    {ing.amount && <span className="text-gray-400">：{ing.amount}</span>}
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
              onClick={onAddMeal}
              className="flex items-center gap-1 text-xs text-green-600 border border-green-200 rounded-lg px-3 py-1.5 hover:bg-green-50 transition"
            >
              <UtensilsCrossed size={12} /> 食事に追加
            </button>
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
  const location = useLocation()
  const fromMealType = (location.state as { fromMealType?: string } | null)?.fromMealType
  const { db, isLoading, isSaving, error, loadDB, addRecipe, updateRecipe, deleteRecipe } = useRecipeStore()

  const [filterCat, setFilterCat] = useState<RecipeCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Recipe | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    loadDB()
  }, [loadDB])

  const q = searchQuery.trim().toLowerCase()

  const filtered = db.recipes.filter(r => {
    if (filterCat !== 'all' && r.category !== filterCat) return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      r.tags.some(t => t.toLowerCase().includes(q)) ||
      r.ingredients?.some(i => i.name.toLowerCase().includes(q)) ||
      r.note?.toLowerCase().includes(q)
    )
  })

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
        // "15 g" のように数字と単位が分かれている場合は結合する
        const parts = line.split(/\s+/)
        if (parts.length === 1) return { name: parts[0], amount: '' }
        let amount = parts[parts.length - 1]
        let nameEnd = parts.length - 1
        // 末尾が単位のみ（数字なし）で、その前が数字の場合は結合
        if (nameEnd >= 1 && /^[^\d]+$/.test(amount) && /^\d/.test(parts[nameEnd - 1])) {
          amount = parts[nameEnd - 1] + amount
          nameEnd -= 1
        }
        const name = parts.slice(0, nameEnd).join(' ')
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
      sodium:      f.sodium > 0 ? f.sodium : undefined,
      ingredients: ingredients.length > 0 ? ingredients : undefined,
      note:        f.note.trim() || undefined,
      sourceUrl:   f.sourceUrl.trim() || undefined,
      imageFileId: f.imageFileId || undefined,
    }
  }

  const handleSave = async (f: FormState, image: PendingImage) => {
    // 画像の反映（アップロード／削除）を先に確定し、fileIdをレシピに載せる
    let imageFileId = f.imageFileId || undefined
    try {
      if (image.kind === 'set') {
        imageFileId = await uploadImageToDrive(image.base64, image.mimeType)
        // 差し替え時は古い画像を削除（失敗しても保存は続行）
        if (f.imageFileId) await deleteFileFromDrive(f.imageFileId).catch(() => {})
      } else if (image.kind === 'remove') {
        if (f.imageFileId) await deleteFileFromDrive(f.imageFileId).catch(() => {})
        imageFileId = undefined
      }
    } catch {
      // 画像アップロード失敗時は画像なしで保存を続行
      imageFileId = f.imageFileId || undefined
    }

    const recipe = { ...formStateToRecipe(f), imageFileId }
    if (editTarget) {
      await updateRecipe(editTarget.id, recipe)
    } else {
      await addRecipe(recipe)
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
      // 紐づく画像ファイルも削除（失敗しても本体削除は続行）
      const target = db.recipes.find(r => r.id === id)
      if (target?.imageFileId) await deleteFileFromDrive(target.imageFileId).catch(() => {})
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

      {/* 検索バー */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          className="w-full border border-gray-200 rounded-xl pl-8 pr-8 py-2 text-sm focus:outline-none focus:border-green-400"
          placeholder="料理名・タグ・材料で検索"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setSearchQuery('')}
          >
            <X size={14} />
          </button>
        )}
      </div>

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
          {q ? (
            <p className="text-sm">「{searchQuery}」に一致するレシピはありません</p>
          ) : (
            <>
              <p className="text-sm">レシピがまだありません</p>
              <p className="text-sm">「レシピを登録する」から追加してください</p>
            </>
          )}
        </div>
      )}

      {fromMealType && sortedFiltered.length > 0 && (
        <p className="text-xs text-center text-gray-400">タップして選択、複数選択可</p>
      )}

      <div className="space-y-3">
        {sortedFiltered.map(r => (
          <RecipeCard
            key={r.id}
            recipe={r}
            onEdit={() => handleEdit(r)}
            onDelete={() => handleDelete(r.id)}
            onAddMeal={() => navigate('/meal', { state: { pendingEntries: [recipeToEntry(r)], mealType: fromMealType } })}
            selectable={!!fromMealType}
            selected={selectedIds.has(r.id)}
            onToggleSelect={() => toggleSelect(r.id)}
          />
        ))}
      </div>

      {fromMealType && selectedIds.size > 0 && (
        <div className="sticky bottom-4">
          <button
            onClick={() => {
              const entries = db.recipes
                .filter(r => selectedIds.has(r.id))
                .map(recipeToEntry)
              navigate('/meal', { state: { pendingEntries: entries, mealType: fromMealType } })
            }}
            className="w-full bg-green-500 text-white rounded-2xl py-3.5 font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-green-600 transition active:scale-95"
          >
            <UtensilsCrossed size={18} />
            {selectedIds.size}件を食事に追加
          </button>
        </div>
      )}

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
