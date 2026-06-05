import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { localDateStr } from '../lib/utils'
import { useAppStore } from '../lib/store'
import { analyzeFoodText, analyzeFoodImage, analyzeFoodLabel, getApiKey, type AiFoodResult } from '../lib/gemini'
import { lookupBarcode, BarcodeNotFoundError, submitToOpenFoodFacts, toPer100g } from '../lib/barcode'
import { getMealAdvice, getMealSuggestion } from '../lib/advice'
import type { MealLog, FoodEntry, TemplateFoodItem } from '../types'
import { nanoid } from 'nanoid'
import { Camera, Pencil, Plus, Trash2, ChevronDown, ChevronUp, X, Sparkles, ScanBarcode, PackageSearch, CalendarRange, BookMarked, Upload, Search, BookOpen } from 'lucide-react'
import BarcodeScanner from '../components/BarcodeScanner'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食',
}

function TemplateFoodForm({ item, onSave, onCancel }: {
  item: TemplateFoodItem
  onSave: (t: TemplateFoodItem) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(item)
  const set = (k: keyof TemplateFoodItem, v: string | number | undefined) =>
    setForm(prev => ({ ...prev, [k]: v }))
  return (
    <div className="bg-amber-50 rounded-xl px-3 py-3 space-y-2">
      <input
        value={form.name}
        onChange={e => set('name', e.target.value)}
        placeholder="食品名（例：ザバスホエイプロテイン）"
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <input
        value={form.jan ?? ''}
        onChange={e => set('jan', e.target.value)}
        placeholder="JANコード（任意）"
        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
      />
      <div className="flex items-center gap-1.5">
        <input type="number" value={form.grams}
          onChange={e => set('grams', Number(e.target.value))}
          className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <span className="text-xs text-gray-400">g</span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {([
          { k: 'calories', label: 'kcal' },
          { k: 'protein',  label: 'P(g)' },
          { k: 'fat',      label: 'F(g)' },
          { k: 'carbs',    label: 'C(g)' },
        ] as const).map(({ k, label }) => (
          <div key={k} className="flex items-center gap-1">
            <span className="text-xs text-gray-400">{label}:</span>
            <input type="number" value={(form as unknown as Record<string, number>)[k]}
              onChange={e => set(k, Number(e.target.value))}
              className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-2 text-sm hover:bg-gray-50 transition">
          キャンセル
        </button>
        <button onClick={() => onSave(form)} disabled={!form.name.trim()}
          className="flex-1 bg-amber-500 text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-40 hover:bg-amber-600 transition">
          保存
        </button>
      </div>
    </div>
  )
}

function parseTemplateCsv(text: string, shop?: string): TemplateFoodItem[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  // ヘッダー行をスキップ（1行目が数値でなければヘッダーと判断）
  const firstCols = lines[0].split(',')
  const startIdx = isNaN(Number(firstCols[1])) ? 1 : 0
  return lines.slice(startIdx).flatMap(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const [name, grams, calories, protein, fat, carbs, sodium, jan] = cols
    if (!name || isNaN(Number(calories))) return []
    return [{
      id: nanoid(),
      name,
      grams: Number(grams) || 0,
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      fat: Number(fat) || 0,
      carbs: Number(carbs) || 0,
      sodium: sodium ? Number(sodium) : undefined,
      jan: jan || undefined,
      ...(shop ? { shop } : {}),
    }]
  })
}

function TemplateMode({ templates, editingTemplate, newTemplate, onAdd, onEdit, onDelete, onSave, onNewTemplate, onCsvImport, onClose }: {
  templates: TemplateFoodItem[]
  editingTemplate: TemplateFoodItem | null
  newTemplate: boolean
  onAdd: (t: TemplateFoodItem) => void
  onEdit: (t: TemplateFoodItem) => void
  onDelete: (id: string) => void
  onSave: (t: TemplateFoodItem) => void
  onNewTemplate: () => void
  onCsvImport: (items: TemplateFoodItem[]) => void
  onClose: () => void
}) {
  const isWeb = Capacitor.getPlatform() === 'web'
  const [csvError, setCsvError] = useState<string | null>(null)
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const shops = ['all', ...Array.from(new Set(templates.map(t => t.shop ?? '').filter(Boolean)))]
  const byShop = shopFilter === 'all' ? templates : templates.filter(t => (t.shop ?? '') === shopFilter)
  const filtered = searchQuery.trim()
    ? byShop.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || (t.shop ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
    : byShop

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const shop = file.name.replace(/\.csv$/i, '')
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const items = parseTemplateCsv(text, shop)
      if (items.length === 0) {
        setCsvError('有効なデータが見つかりませんでした。フォーマットを確認してください。')
      } else {
        setCsvError(null)
        onCsvImport(items)
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-amber-600">
          <BookMarked size={16} />
          <span className="text-sm font-medium">テンプレート食品</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      {isWeb && (
        <div>
          <label className="w-full border border-amber-300 bg-amber-50 rounded-xl py-2.5 text-amber-700 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer hover:bg-amber-100 transition">
            <Upload size={14} />
            CSVファイルから一括取込
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
          </label>
          {csvError && <p className="text-xs text-red-500 mt-1 px-1">{csvError}</p>}
          <p className="text-xs text-gray-400 mt-1 px-1">
            形式: 名前,グラム,kcal,P(g),F(g),C(g),Na(mg),JAN — 1行目はヘッダー可
          </p>
        </div>
      )}

      {templates.length === 0 && !newTemplate && (
        <p className="text-xs text-gray-400 text-center py-2">
          よく食べる食品を登録して素早く追加できます
        </p>
      )}

      {templates.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="食品名・店舗名で検索..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {shops.length > 2 && (
        <div className="flex gap-1.5 flex-wrap">
          {shops.map(s => (
            <button key={s} onClick={() => setShopFilter(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${shopFilter === s ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-amber-50'}`}>
              {s === 'all' ? 'すべて' : s}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && templates.length > 0 && (
        <p className="text-xs text-gray-400 text-center py-2">
          該当する食品が見つかりません
        </p>
      )}

      {filtered.map(t => (
        <div key={t.id}>
          {editingTemplate?.id === t.id && !newTemplate ? (
            <TemplateFoodForm
              item={editingTemplate}
              onSave={onSave}
              onCancel={() => onEdit(t)}
            />
          ) : (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <button
                onClick={() => onAdd(t)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-medium text-gray-700">{t.name}</p>
                <p className="text-xs text-gray-400">
                  {t.shop && <span className="text-amber-500 mr-1">[{t.shop}]</span>}
                  {t.grams > 0 ? `${t.grams}g｜` : ''}{t.calories}kcal P:{t.protein}g F:{t.fat}g C:{t.carbs}g
                </p>
              </button>
              <button onClick={() => onEdit(t)} className="text-gray-300 hover:text-amber-400 shrink-0">
                <Pencil size={14} />
              </button>
              <button onClick={() => onDelete(t.id)} className="text-gray-300 hover:text-red-400 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      ))}

      {newTemplate && editingTemplate ? (
        <TemplateFoodForm
          item={editingTemplate}
          onSave={onSave}
          onCancel={onClose}
        />
      ) : (
        <button
          onClick={onNewTemplate}
          className="w-full border-2 border-dashed border-amber-200 rounded-xl py-3 text-amber-500 text-sm font-medium hover:bg-amber-50 transition flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          テンプレートを追加
        </button>
      )}

      {templates.length > 0 && (
        <p className="text-xs text-center text-gray-400">タップして食事に追加</p>
      )}
    </div>
  )
}

function NutrientBar({ label, value, unit, color, low, high }: {
  label: string; value: number; unit: string; color: string; low: number; high: number
}) {
  const pct = Math.min((value / high) * 100, 100)
  const over  = value > high
  const under = value < low
  const valueColor = over ? 'text-red-500' : under ? 'text-gray-500' : 'text-green-600'
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className={`font-medium ${valueColor}`}>
          {value}{unit}
          <span className="text-gray-400 font-normal ml-1">/ {low}〜{high}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${over ? 'bg-red-400' : color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function toFoodEntry(r: AiFoodResult): FoodEntry {
  return {
    foodId: nanoid(),
    foodName: r.name,
    grams: r.grams,
    calories: r.calories,
    protein: r.protein,
    fat: r.fat,
    carbs: r.carbs,
    sodium: r.na,
  }
}

export default function Meal() {
  const { data, saveData } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const today = localDateStr()

  const [mealType, setMealType] = useState<MealType>(() => {
    const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
    const registered = new Set(
      data.mealLogs.filter(m => m.date === today).map(m => m.mealType)
    )
    return order.find(t => !registered.has(t)) ?? 'snack'
  })

  const handleMealTypeChange = (t: MealType) => {
    setMealType(t)
    // タブ切替時は結果・入力をリセット（モードは維持）
    setResults(null)
    setError(null)
    setTextInput('')
    setPreviewUrl(null)
    setImageBase64(null)
  }
  const [mode, setMode] = useState<'idle' | 'text' | 'image' | 'barcode' | 'label' | 'template' | 'barcode-template-search'>('idle')
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null)
  const [labelBase64, setLabelBase64] = useState<string | null>(null)
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string | null>(null)
  const [labelImageType, setLabelImageType] = useState<string>('image/jpeg')
  const [submitting, setSubmitting] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageType, setImageType] = useState<string>('image/jpeg')
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState<AiFoodResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [advice, setAdvice] = useState<string | null>(null)
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [lastSavedLog, setLastSavedLog] = useState<MealLog | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<TemplateFoodItem | null>(null)
  const [newTemplate, setNewTemplate] = useState(false)

  const hasApiKey = !!getApiKey()
  const templateFoods = data.templateFoods ?? []

  // MealPlan / RecipeDB からの遷移でエントリを受け取る
  useEffect(() => {
    const state = location.state as { pendingEntries?: AiFoodResult[]; mealType?: MealType } | null
    if (state?.pendingEntries && state.pendingEntries.length > 0) {
      setResults(state.pendingEntries)
      if (state.mealType) setMealType(state.mealType)
      // state をクリアして戻ったときに再展開しない
      navigate(location.pathname, { replace: true, state: null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 今日の食事ログ
  const todayLogs = data.mealLogs
    .filter((m) => m.date === today)
    .sort((a, b) => {
      const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
      return order.indexOf(a.mealType as MealType) - order.indexOf(b.mealType as MealType)
    })

  const totals = todayLogs.reduce(
    (acc, log) => {
      log.entries.forEach((e) => {
        acc.calories += e.calories
        acc.protein  += e.protein
        acc.fat      += e.fat
        acc.carbs    += e.carbs
      })
      return acc
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  )
  totals.protein = Math.round(totals.protein * 10) / 10
  totals.fat     = Math.round(totals.fat * 10) / 10
  totals.carbs   = Math.round(totals.carbs * 10) / 10

  const goalCal = data.settings.goalCalories ?? 2000
  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? 60

  // PFC 目標レンジ（理想〜想定）
  const goalProteinLow  = Math.round(weightKg * 1.6)
  const goalProteinHigh = Math.round(weightKg * 2.0)
  const goalFatLow      = Math.round(goalCal * 0.20 / 9)
  const goalFatHigh     = Math.round(goalCal * 0.30 / 9)
  const goalCarbsLow    = Math.round(goalCal * 0.50 / 4)
  const goalCarbsHigh   = Math.round(goalCal * 0.60 / 4)

  // 画像選択（ネイティブカメラ）
  const handleImageCapture = async () => {
    try {
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      })
      if (!photo.dataUrl) return
      setPreviewUrl(photo.dataUrl)
      setImageBase64(photo.dataUrl.split(',')[1])
      setImageType(`image/${photo.format}`)
    } catch {
      // キャンセルは無視
    }
  }

  // AI解析実行
  const handleAnalyze = async () => {
    setError(null)
    setAnalyzing(true)
    try {
      let res: AiFoodResult[]
      if (mode === 'text') {
        res = await analyzeFoodText(textInput)
      } else {
        if (!imageBase64) return
        res = await analyzeFoodImage(imageBase64, imageType)
      }
      setResults(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setAnalyzing(false)
    }
  }


  // 個別削除（結果から）
  const removeResult = (idx: number) => {
    setResults((prev) => prev?.filter((_, i) => i !== idx) ?? null)
  }

  // 食事エントリー削除
  const handleDelete = async (logId: string, entryIdx: number) => {
    const updatedLogs = data.mealLogs
      .map((m) => m.id !== logId ? m : { ...m, entries: m.entries.filter((_, i) => i !== entryIdx) })
      .filter((m) => m.entries.length > 0)
    await saveData({ mealLogs: updatedLogs })
  }

  const reset = () => {
    setMode('idle'); setResults(null); setError(null)
    setTextInput(''); setPreviewUrl(null); setImageBase64(null)
    setPendingBarcode(null); setLabelBase64(null); setLabelPreviewUrl(null)
    setEditingTemplate(null); setNewTemplate(false); setTemplateSearchQuery('')
  }

  const handleTemplateAdd = (t: TemplateFoodItem) => {
    const entry: AiFoodResult = {
      name: t.name, grams: t.grams, calories: t.calories,
      protein: t.protein, fat: t.fat, carbs: t.carbs, na: t.sodium ?? 0,
      fiber: 0, vitA: 0, vitC: 0, vitD: 0, ca: 0, fe: 0,
    }
    setResults(prev => [...(prev ?? []), entry])
    setMode('idle')
  }

  const handleTemplateSave = async (t: TemplateFoodItem) => {
    const updated = templateFoods.some(x => x.id === t.id)
      ? templateFoods.map(x => x.id === t.id ? t : x)
      : [...templateFoods, t]
    await saveData({ templateFoods: updated })
    setEditingTemplate(null)
    setNewTemplate(false)
  }

  const handleTemplateDelete = async (id: string) => {
    await saveData({ templateFoods: templateFoods.filter(x => x.id !== id) })
  }

  const handleCsvImport = async (items: TemplateFoodItem[]) => {
    const importMap = new Map(items.map(t => [t.name, t]))
    // 既存エントリは CSV の値で上書き（id・手動編集内容は保持）
    const updated = templateFoods.map(t =>
      importMap.has(t.name) ? { ...t, ...importMap.get(t.name)!, id: t.id } : t
    )
    const existingNames = new Set(templateFoods.map(t => t.name))
    const toAdd = items.filter(t => !existingNames.has(t.name))
    await saveData({ templateFoods: [...updated, ...toAdd] })
  }

  const [templateSearchQuery, setTemplateSearchQuery] = useState('')

  const handleBarcodeDetected = async (code: string) => {
    setMode('idle')
    setError(null)
    setAnalyzing(true)
    try {
      // ① テンプレートDBをJANコードで検索
      const byJan = templateFoods.find(t => t.jan === code)
      if (byJan) {
        handleTemplateAdd(byJan)
        return
      }
      // ② OpenFoodFacts検索
      const result = await lookupBarcode(code)
      setResults([result])
    } catch (e) {
      if (e instanceof BarcodeNotFoundError) {
        setPendingBarcode(e.barcode)
        setTemplateSearchQuery('')
        setMode('barcode-template-search')
        setError(null)
      } else {
        setError(e instanceof Error ? e.message : 'バーコード取得に失敗しました')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const handleLabelCapture = async () => {
    try {
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      })
      if (!photo.dataUrl) return
      setLabelPreviewUrl(photo.dataUrl)
      setLabelBase64(photo.dataUrl.split(',')[1])
      setLabelImageType(`image/${photo.format}`)
    } catch {
      // キャンセルは無視
    }
  }

  const handleAnalyzeLabel = async () => {
    if (!labelBase64) return
    setError(null)
    setAnalyzing(true)
    try {
      const result = await analyzeFoodLabel(labelBase64, labelImageType)
      setResults([result])
      setMode('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI解析に失敗しました')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleAddAllWithSubmit = async () => {
    if (!results) return
    setSaving(true)
    setSubmitting(false)
    try {
      // Open Food Facts への投稿（未収録バーコードがある場合）
      if (pendingBarcode && results.length > 0) {
        setSubmitting(true)
        const per100g = toPer100g(results[0])
        await submitToOpenFoodFacts(
          pendingBarcode, results[0], per100g,
          labelBase64 ?? undefined,
          labelImageType ?? undefined,
        )
        setSubmitting(false)
        setPendingBarcode(null)
      }

      const entries = results.map(toFoodEntry)
      const existing = data.mealLogs.find(
        (m) => m.date === today && m.mealType === mealType
      )
      let updatedLogs: MealLog[]
      if (existing) {
        updatedLogs = data.mealLogs.map((m) =>
          m.id === existing.id ? { ...m, entries: [...m.entries, ...entries] } : m
        )
      } else {
        updatedLogs = [...data.mealLogs, { id: nanoid(), date: today, mealType, entries }]
      }
      await saveData({ mealLogs: updatedLogs })
      setResults(null)
      setError(null)
      setTextInput('')
      setPreviewUrl(null)
      setImageBase64(null)
      setLabelBase64(null)
      setLabelPreviewUrl(null)

      const savedLog = updatedLogs.find(m => m.date === today && m.mealType === mealType)
      if (savedLog) {
        setLastSavedLog(savedLog)
        setAdvice(null)
        setSuggestion(null)
      }
    } finally {
      setSaving(false)
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 space-y-4">

      {/* 週間献立プランへのリンク */}
      <button
        onClick={() => navigate('/mealplan')}
        className="w-full flex items-center gap-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl px-4 py-3 hover:from-green-100 hover:to-emerald-100 transition"
      >
        <CalendarRange size={20} className="text-green-600 shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-green-700">週間献立プランを作成</p>
          <p className="text-xs text-green-600">目標カロリーに合わせた7日分の献立をAIが生成</p>
        </div>
        <span className="text-green-400 text-xs">›</span>
      </button>

      {/* AIアドバイス・献立提案（食事保存後に表示） */}
      {hasApiKey && lastSavedLog && (
        <div className="space-y-3">
          {/* アドバイス */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-green-500" />
                <p className="text-xs font-semibold text-green-700">AI アドバイス</p>
              </div>
              <div className="flex items-center gap-2">
                {advice && (
                  <button onClick={() => setAdvice(null)} className="text-gray-300 hover:text-gray-400">
                    <X size={13} />
                  </button>
                )}
                <button
                  onClick={async () => {
                    setAdviceLoading(true)
                    setAdvice(null)
                    try {
                      const a = await getMealAdvice(lastSavedLog, useAppStore.getState().data)
                      if (a) setAdvice(a)
                    } finally {
                      setAdviceLoading(false)
                    }
                  }}
                  disabled={adviceLoading}
                  className="text-xs text-green-600 hover:text-green-800 disabled:opacity-40 border border-green-300 rounded-lg px-2 py-0.5 transition"
                >
                  {adviceLoading ? '生成中...' : '取得'}
                </button>
              </div>
            </div>
            {adviceLoading
              ? <p className="text-sm text-gray-400 animate-pulse">アドバイスを生成中...</p>
              : advice
                ? <p className="text-sm text-gray-700 whitespace-pre-line">{advice}</p>
                : <p className="text-xs text-gray-400">「取得」を押すとこの食事へのアドバイスが表示されます</p>
            }
          </div>

          {/* 残りの献立提案 */}
          {(() => {
            const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'] as const
            type MealOrderType = typeof MEAL_ORDER[number]
            const registeredTypes = new Set(
              useAppStore.getState().data.mealLogs.filter(m => m.date === today).map(m => m.mealType as MealOrderType)
            )
            const unregistered = MEAL_ORDER.filter(t => !registeredTypes.has(t))
            if (unregistered.length === 0) return null
            const LABELS: Record<string, string> = { breakfast: '朝食', lunch: '昼食', dinner: '夕食' }
            return (
              <div className="bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={14} className="text-blue-500" />
                    <p className="text-xs font-semibold text-blue-700">
                      残りの献立提案（{unregistered.map(t => LABELS[t]).join('・')}）
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {suggestion && (
                      <button onClick={() => setSuggestion(null)} className="text-gray-300 hover:text-gray-400">
                        <X size={13} />
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        setSuggestionLoading(true)
                        setSuggestion(null)
                        try {
                          const s = await getMealSuggestion(useAppStore.getState().data)
                          if (s) setSuggestion(s)
                        } finally {
                          setSuggestionLoading(false)
                        }
                      }}
                      disabled={suggestionLoading}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 border border-blue-300 rounded-lg px-2 py-0.5 transition"
                    >
                      {suggestionLoading ? '生成中...' : '取得'}
                    </button>
                  </div>
                </div>
                {suggestionLoading
                  ? <p className="text-sm text-gray-400 animate-pulse">献立を提案中...</p>
                  : suggestion
                    ? <p className="text-sm text-gray-700 whitespace-pre-line">{suggestion}</p>
                    : <p className="text-xs text-gray-400">「取得」を押すと残りの食事の献立を提案します</p>
                }
              </div>
            )
          })()}
        </div>
      )}

      {/* 今日の栄養サマリー */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-gray-700">今日の栄養摂取</h2>
          <span className="text-xs text-gray-400">{today}</span>
        </div>
        <div className="flex justify-around text-center mb-3">
          <div>
            <p className="text-xl font-bold text-green-500">{totals.calories}</p>
            <p className="text-xs text-gray-400">摂取 kcal</p>
          </div>
          <div>
            <p className="text-xl font-bold text-gray-400">{goalCal}</p>
            <p className="text-xs text-gray-400">目標 kcal</p>
          </div>
          <div>
            <p className={`text-xl font-bold ${goalCal - totals.calories >= 0 ? 'text-blue-500' : 'text-red-400'}`}>
              {goalCal - totals.calories}
            </p>
            <p className="text-xs text-gray-400">残り kcal</p>
          </div>
        </div>
        <div className="space-y-2">
          <NutrientBar label="タンパク質" value={totals.protein} unit="g" color="bg-blue-400"   low={goalProteinLow} high={goalProteinHigh} />
          <NutrientBar label="脂質"       value={totals.fat}     unit="g" color="bg-yellow-400" low={goalFatLow}     high={goalFatHigh} />
          <NutrientBar label="炭水化物"   value={totals.carbs}   unit="g" color="bg-orange-400" low={goalCarbsLow}   high={goalCarbsHigh} />
        </div>
      </div>

      {/* 食事追加 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">食事を追加</h2>

        {/* 食事タイプ */}
        <div className="flex gap-2 mb-4">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((t) => (
            <button key={t} onClick={() => handleMealTypeChange(t)}
              className={`flex-1 py-1.5 text-xs rounded-lg transition ${mealType === t ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {MEAL_LABELS[t]}
            </button>
          ))}
        </div>
        {/* 食べなかったボタン（選択中の食事タイプがまだ未登録の場合のみ表示） */}
        {!data.mealLogs.find(m => m.date === today && m.mealType === mealType) && mode === 'idle' && (
          <button
            onClick={async () => {
              const newLog: import('../types').MealLog = {
                id: nanoid(), date: today, mealType, entries: [], skipped: true,
              }
              await saveData({ mealLogs: [...data.mealLogs, newLog] })
            }}
            className="w-full mb-3 border border-gray-200 rounded-xl py-2 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition"
          >
            {MEAL_LABELS[mealType]}は食べなかった
          </button>
        )}

        {!hasApiKey ? (
          <div className="text-center py-4 text-sm text-gray-400">
            <p>⚙️ 設定画面でClaude APIキーを登録すると</p>
            <p>AI食品解析が使えるようになります</p>
          </div>
        ) : mode === 'idle' ? (
          // 入力モード選択
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setMode('image')}
              className="flex flex-col items-center gap-2 border-2 border-dashed border-green-200 rounded-xl py-5 text-green-600 hover:bg-green-50 transition">
              <Camera size={28} />
              <span className="text-sm font-medium">写真から解析</span>
              <span className="text-xs text-gray-400">食事の写真を撮影・選択</span>
            </button>
            <button onClick={() => setMode('text')}
              className="flex flex-col items-center gap-2 border-2 border-dashed border-blue-200 rounded-xl py-5 text-blue-600 hover:bg-blue-50 transition">
              <Pencil size={28} />
              <span className="text-sm font-medium">テキストで入力</span>
              <span className="text-xs text-gray-400">食べた内容を自由記入</span>
            </button>
            <button onClick={() => setMode('barcode')}
              className="flex flex-col items-center gap-2 border-2 border-dashed border-purple-200 rounded-xl py-5 text-purple-600 hover:bg-purple-50 transition">
              <ScanBarcode size={28} />
              <span className="text-sm font-medium">バーコード</span>
              <span className="text-xs text-gray-400">JANコードから取得</span>
            </button>
            <button onClick={() => setMode('template')}
              className="flex flex-col items-center gap-2 border-2 border-dashed border-amber-200 rounded-xl py-5 text-amber-600 hover:bg-amber-50 transition">
              <BookMarked size={28} />
              <span className="text-sm font-medium">テンプレート</span>
              <span className="text-xs text-gray-400">よく使う食品から追加</span>
            </button>
            <button onClick={() => navigate('/recipedb')}
              className="flex flex-col items-center gap-2 border-2 border-dashed border-teal-200 rounded-xl py-5 text-teal-600 hover:bg-teal-50 transition">
              <BookOpen size={28} />
              <span className="text-sm font-medium">レシピDB</span>
              <span className="text-xs text-gray-400">登録レシピから追加</span>
            </button>
          </div>
        ) : mode === 'text' ? (
          // テキスト入力モード
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">食べた内容を入力</span>
              <button onClick={reset} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={"例:\nご飯200g\n鶏むね肉の塩焼き150g\nサラダ(レタス・トマト)\n味噌汁"}
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
            {!results && (
              <button onClick={handleAnalyze} disabled={analyzing || !textInput.trim()}
                className="w-full bg-blue-500 text-white rounded-xl py-3 font-semibold disabled:opacity-40 hover:bg-blue-600 transition">
                {analyzing ? 'AI解析中...' : '✨ AIで栄養素を解析'}
              </button>
            )}
          </div>
        ) : mode === 'template' ? (
          <TemplateMode
            templates={templateFoods}
            editingTemplate={editingTemplate}
            newTemplate={newTemplate}
            onAdd={handleTemplateAdd}
            onEdit={setEditingTemplate}
            onDelete={handleTemplateDelete}
            onSave={handleTemplateSave}
            onNewTemplate={() => {
              setNewTemplate(true)
              setEditingTemplate({ id: nanoid(), name: '', grams: 100, calories: 0, protein: 0, fat: 0, carbs: 0 })
            }}
            onCsvImport={handleCsvImport}
            onClose={reset}
          />
        ) : mode === 'barcode' ? (
          // バーコードスキャンモード
          <div className="space-y-3">
            {analyzing ? (
              <div className="text-center py-6 text-sm text-gray-400 animate-pulse">商品情報を取得中...</div>
            ) : (
              <BarcodeScanner
                onDetected={handleBarcodeDetected}
                onClose={reset}
              />
            )}
          </div>
        ) : mode === 'barcode-template-search' ? (
          // バーコード未収録：テンプレートDB検索
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-amber-600">
                <PackageSearch size={16} />
                <span className="text-sm font-medium">テンプレートから検索</span>
              </div>
              <button onClick={reset} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <p className="text-xs text-gray-500 bg-amber-50 rounded-xl px-3 py-2">
              バーコードがDBに未登録です。テンプレートに登録済みの食品を検索して追加できます。
            </p>
            {pendingBarcode && (
              <p className="text-xs text-gray-400">バーコード: <span className="font-mono">{pendingBarcode}</span></p>
            )}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={templateSearchQuery}
                onChange={e => setTemplateSearchQuery(e.target.value)}
                placeholder="食品名で検索..."
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {templateSearchQuery && (
                <button onClick={() => setTemplateSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            {templateSearchQuery.trim() && (() => {
              const q = templateSearchQuery.toLowerCase()
              const hits = templateFoods.filter(t =>
                t.name.toLowerCase().includes(q) || (t.shop ?? '').toLowerCase().includes(q)
              )
              return hits.length > 0 ? (
                <div className="space-y-1.5">
                  {hits.map(t => (
                    <button key={t.id} onClick={async () => {
                      // JANを紐付けて保存（次回からJAN検索でヒット）
                      if (pendingBarcode && !t.jan) {
                        const updated = templateFoods.map(x => x.id === t.id ? { ...x, jan: pendingBarcode } : x)
                        await saveData({ templateFoods: updated })
                      }
                      handleTemplateAdd(t)
                      setPendingBarcode(null)
                    }}
                      className="w-full flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-left hover:bg-amber-50 transition">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">{t.name}</p>
                        <p className="text-xs text-gray-400">
                          {t.shop && <span className="text-amber-500 mr-1">[{t.shop}]</span>}
                          {t.grams > 0 ? `${t.grams}g｜` : ''}{t.calories}kcal P:{t.protein}g F:{t.fat}g C:{t.carbs}g
                          {t.jan && <span className="ml-1 font-mono text-gray-300">{t.jan}</span>}
                        </p>
                      </div>
                      <Plus size={16} className="text-amber-400 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">該当する食品が見つかりません</p>
              )
            })()}
            <button
              onClick={() => setMode('label')}
              className="w-full border border-purple-200 bg-purple-50 rounded-xl py-3 text-purple-600 text-sm font-medium hover:bg-purple-100 transition flex items-center justify-center gap-2"
            >
              <Camera size={16} />
              栄養成分ラベルを撮影して手入力
            </button>
          </div>
        ) : mode === 'label' ? (
          // 未収録商品：ラベル撮影モード
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-purple-600">
                <PackageSearch size={16} />
                <span className="text-sm font-medium">データベース未収録の商品</span>
              </div>
              <button onClick={reset} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <p className="text-xs text-gray-500 bg-purple-50 rounded-xl px-3 py-2">
              栄養成分表示ラベルを撮影すると、AIが読み取ってOpen Food Factsに登録します。
            </p>
            {pendingBarcode && (
              <p className="text-xs text-gray-400">バーコード: <span className="font-mono">{pendingBarcode}</span></p>
            )}
            {labelPreviewUrl ? (
              <div className="relative">
                <img src={labelPreviewUrl} alt="ラベル" className="w-full rounded-xl object-cover max-h-48" />
                <button onClick={() => { setLabelPreviewUrl(null); setLabelBase64(null) }}
                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow">
                  <X size={14} className="text-gray-600" />
                </button>
              </div>
            ) : (
              <button onClick={handleLabelCapture}
                className="w-full border-2 border-dashed border-purple-200 rounded-xl py-8 flex flex-col items-center gap-2 text-purple-600 hover:bg-purple-50 transition">
                <Camera size={32} />
                <span className="text-sm">栄養成分表示を撮影</span>
                <span className="text-xs text-gray-400">パッケージ裏の成分表を写してください</span>
              </button>
            )}
            {labelPreviewUrl && (
              <button onClick={handleAnalyzeLabel} disabled={analyzing}
                className="w-full bg-purple-500 text-white rounded-xl py-3 font-semibold disabled:opacity-40 hover:bg-purple-600 transition">
                {analyzing ? 'AI読み取り中...' : '✨ AIで栄養素を読み取る'}
              </button>
            )}
          </div>
        ) : (
          // 画像入力モード
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">食事の写真を選択</span>
              <button onClick={reset} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            {previewUrl ? (
              <div className="relative">
                <img src={previewUrl} alt="食事" className="w-full rounded-xl object-cover max-h-48" />
                <button onClick={() => { setPreviewUrl(null); setImageBase64(null) }}
                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow">
                  <X size={14} className="text-gray-600" />
                </button>
              </div>
            ) : (
              <button onClick={handleImageCapture}
                className="w-full border-2 border-dashed border-green-200 rounded-xl py-8 flex flex-col items-center gap-2 text-green-600 hover:bg-green-50 transition">
                <Camera size={32} />
                <span className="text-sm">タップして撮影</span>
              </button>
            )}
            {previewUrl && !results && (
              <button onClick={handleAnalyze} disabled={analyzing}
                className="w-full bg-green-500 text-white rounded-xl py-3 font-semibold disabled:opacity-40 hover:bg-green-600 transition">
                {analyzing ? 'AI解析中...' : '✨ AIで栄養素を解析'}
              </button>
            )}
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="mt-3 bg-red-50 text-red-500 text-sm rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {/* AI解析結果 */}
        {results && (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">解析結果（編集できます）</p>
            {results.map((r, i) => (
              <div key={i} className="bg-gray-50 rounded-xl px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    value={r.name}
                    onChange={e => setResults(prev => prev?.map((x, j) => j === i ? { ...x, name: e.target.value } : x) ?? null)}
                    className="flex-1 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
                    placeholder="商品名"
                  />
                  <button onClick={() => removeResult(i)} className="text-gray-300 hover:text-red-400 shrink-0">
                    <X size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={r.grams}
                    onChange={e => setResults(prev => prev?.map((x, j) => j === i ? { ...x, grams: Number(e.target.value) } : x) ?? null)}
                    className="w-20 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                  <span className="text-xs text-gray-400">g</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {([
                    { key: 'calories', label: 'kcal', color: 'focus:ring-green-400' },
                    { key: 'protein',  label: 'P',    color: 'focus:ring-blue-400' },
                    { key: 'fat',      label: 'F',    color: 'focus:ring-yellow-400' },
                    { key: 'carbs',    label: 'C',    color: 'focus:ring-orange-400' },
                  ] as const).map(({ key, label, color }) => (
                    <div key={key} className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">{label}:</span>
                      <input
                        type="number"
                        value={r[key]}
                        onChange={e => setResults(prev => prev?.map((x, j) => j === i ? { ...x, [key]: Number(e.target.value) } : x) ?? null)}
                        className={`w-16 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 ${color}`}
                      />
                      {key !== 'calories' && <span className="text-xs text-gray-400">g</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={reset}
                className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition">
                やり直す
              </button>
              <button onClick={handleAddAllWithSubmit} disabled={saving || results.length === 0}
                className="flex-1 bg-green-500 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-green-600 transition">
                <Plus size={15} />
                {submitting ? 'DB登録中...' : `${MEAL_LABELS[mealType]}に追加`}
              </button>
            </div>
            {pendingBarcode && (
              <p className="text-xs text-center text-purple-500">
                ✓ 追加時にOpen Food Factsへ自動登録されます
              </p>
            )}
          </div>
        )}
      </div>

      {/* 今日の食事一覧 */}
      {todayLogs.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-3">今日の食事</h2>
          <div className="space-y-2">
            {todayLogs.map((log) => {
              const logCal = log.entries.reduce((s, e) => s + e.calories, 0)
              const isOpen = expandedMeal === log.id
              if (log.skipped) {
                return (
                  <div key={log.id} className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2.5 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-400">{MEAL_LABELS[log.mealType as MealType]}</span>
                      <span className="text-xs text-gray-300">食べなかった</span>
                    </div>
                    <button
                      onClick={async () => {
                        await saveData({ mealLogs: data.mealLogs.filter(m => m.id !== log.id) })
                      }}
                      className="text-gray-300 hover:text-red-400 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              }
              return (
                <div key={log.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button className="w-full flex justify-between items-center px-3 py-2.5 hover:bg-gray-50"
                    onClick={() => setExpandedMeal(isOpen ? null : log.id)}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{MEAL_LABELS[log.mealType as MealType]}</span>
                      <span className="text-xs text-gray-400">{log.entries.length}品</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-600">{logCal} kcal</span>
                      {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-100">
                      {log.entries.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="text-sm text-gray-700">{entry.foodName}</p>
                            <p className="text-xs text-gray-400">
                              {entry.grams}g｜P:{entry.protein}g F:{entry.fat}g C:{entry.carbs}g
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-600">{entry.calories}kcal</span>
                            <button onClick={() => handleDelete(log.id, idx)}
                              className="text-gray-300 hover:text-red-400 transition">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
