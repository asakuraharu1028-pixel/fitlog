import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { localDateStr } from '../lib/utils'
import { useAppStore } from '../lib/store'
import { analyzeFoodText, analyzeFoodImage, analyzeFoodLabel, getApiKey, type AiFoodResult } from '../lib/gemini'
import { lookupBarcode, BarcodeNotFoundError, submitToOpenFoodFacts, toPer100g } from '../lib/barcode'
import { getMealAdvice } from '../lib/advice'
import type { MealLog, FoodEntry } from '../types'
import { nanoid } from 'nanoid'
import { Camera, Pencil, Plus, Trash2, ChevronDown, ChevronUp, X, Sparkles, ScanBarcode, PackageSearch, CalendarRange } from 'lucide-react'
import BarcodeScanner from '../components/BarcodeScanner'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食',
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
  const [mode, setMode] = useState<'idle' | 'text' | 'image' | 'barcode' | 'label'>('idle')
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
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null)

  const hasApiKey = !!getApiKey()

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
  }

  const handleBarcodeDetected = async (code: string) => {
    setMode('idle')
    setError(null)
    setAnalyzing(true)
    try {
      const result = await lookupBarcode(code)
      setResults([result])
    } catch (e) {
      if (e instanceof BarcodeNotFoundError) {
        setPendingBarcode(e.barcode)
        setMode('label')
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

      if (hasApiKey) {
        setAdviceLoading(true)
        setAdvice(null)
        const savedLog = updatedLogs.find(m => m.date === today && m.mealType === mealType)
        if (savedLog) {
          getMealAdvice(savedLog, useAppStore.getState().data)
            .then(a => { if (a) setAdvice(a) })
            .finally(() => setAdviceLoading(false))
        } else {
          setAdviceLoading(false)
        }
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

      {/* AIアドバイス */}
      {(adviceLoading || advice) && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 flex gap-3">
          <Sparkles size={18} className="text-green-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-green-700 mb-1">AI アドバイス</p>
            {adviceLoading
              ? <p className="text-sm text-gray-400 animate-pulse">アドバイスを生成中...</p>
              : <p className="text-sm text-gray-700">{advice}</p>
            }
          </div>
          {advice && (
            <button onClick={() => setAdvice(null)} className="text-gray-300 hover:text-gray-400 shrink-0">
              <X size={14} />
            </button>
          )}
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
              className="col-span-2 flex items-center justify-center gap-3 border-2 border-dashed border-purple-200 rounded-xl py-4 text-purple-600 hover:bg-purple-50 transition">
              <ScanBarcode size={24} />
              <div className="text-left">
                <p className="text-sm font-medium">バーコードをスキャン</p>
                <p className="text-xs text-gray-400">商品のJANコードから栄養素を取得</p>
              </div>
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
