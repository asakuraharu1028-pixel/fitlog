import { useState, useRef } from 'react'
import { useAppStore } from '../lib/store'
import { analyzeFoodText, analyzeFoodImage, getApiKey, type AiFoodResult } from '../lib/gemini'
import type { MealLog, FoodEntry } from '../types'
import { nanoid } from 'nanoid'
import { Camera, Pencil, Plus, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食',
}

function NutrientBar({ label, value, unit, color, max }: {
  label: string; value: number; unit: string; color: string; max: number
}) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium text-gray-700">{value}{unit}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
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
  }
}

export default function Meal() {
  const { data, saveData } = useAppStore()
  const today = new Date().toISOString().slice(0, 10)

  const [mealType, setMealType] = useState<MealType>('breakfast')
  const [mode, setMode] = useState<'idle' | 'text' | 'image'>('idle')
  const [textInput, setTextInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageType, setImageType] = useState<string>('image/jpeg')
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState<AiFoodResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  // 画像選択
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageType(file.type)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setPreviewUrl(dataUrl)
      // base64部分のみ抽出
      setImageBase64(dataUrl.split(',')[1])
    }
    reader.readAsDataURL(file)
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

  // 結果を食事ログに追加
  const handleAddAll = async () => {
    if (!results) return
    setSaving(true)
    try {
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
      setMode('idle')
      setTextInput('')
      setPreviewUrl(null)
      setImageBase64(null)
    } finally {
      setSaving(false)
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
  }

  return (
    <div className="p-4 space-y-4">

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
          <NutrientBar label="タンパク質" value={totals.protein} unit="g" color="bg-blue-400"   max={Math.round(goalCal * 0.25 / 4)} />
          <NutrientBar label="脂質"       value={totals.fat}     unit="g" color="bg-yellow-400" max={Math.round(goalCal * 0.25 / 9)} />
          <NutrientBar label="炭水化物"   value={totals.carbs}   unit="g" color="bg-orange-400" max={Math.round(goalCal * 0.55 / 4)} />
        </div>
      </div>

      {/* 食事追加 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">食事を追加</h2>

        {/* 食事タイプ */}
        <div className="flex gap-2 mb-4">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((t) => (
            <button key={t} onClick={() => setMealType(t)}
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
        ) : (
          // 画像入力モード
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">食事の写真を選択</span>
              <button onClick={reset} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={handleImageSelect} />
            {previewUrl ? (
              <div className="relative">
                <img src={previewUrl} alt="食事" className="w-full rounded-xl object-cover max-h-48" />
                <button onClick={() => { setPreviewUrl(null); setImageBase64(null) }}
                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow">
                  <X size={14} className="text-gray-600" />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-green-200 rounded-xl py-8 flex flex-col items-center gap-2 text-green-600 hover:bg-green-50 transition">
                <Camera size={32} />
                <span className="text-sm">タップして写真を選択</span>
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
            <p className="text-sm font-semibold text-gray-700">解析結果（タップで削除）</p>
            {results.map((r, i) => (
              <div key={i} className="flex items-start justify-between bg-gray-50 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">{r.name}（{r.grams}g）</p>
                  <p className="text-xs text-gray-400">
                    {r.calories}kcal｜P:{r.protein}g F:{r.fat}g C:{r.carbs}g
                  </p>
                  <details className="mt-1">
                    <summary className="text-xs text-green-600 cursor-pointer">五大栄養素</summary>
                    <p className="text-xs text-gray-400 mt-1">
                      食物繊維:{r.fiber}g／VitA:{r.vitA}μg／VitC:{r.vitC}mg／VitD:{r.vitD}μg
                      ／Ca:{r.ca}mg／Fe:{r.fe}mg／Na:{r.na}mg
                    </p>
                  </details>
                </div>
                <button onClick={() => removeResult(i)} className="text-gray-300 hover:text-red-400 mt-1">
                  <X size={16} />
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={reset}
                className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition">
                やり直す
              </button>
              <button onClick={handleAddAll} disabled={saving || results.length === 0}
                className="flex-1 bg-green-500 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-green-600 transition">
                <Plus size={15} />
                {MEAL_LABELS[mealType]}に追加
              </button>
            </div>
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
