import { useState, useMemo } from 'react'
import { useAppStore } from '../lib/store'
import { FOOD_DB, type FoodDB } from '../lib/fooddb'
import type { MealLog, FoodEntry } from '../types'
import { nanoid } from 'nanoid'
import { Search, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食',
}

function calcEntry(food: FoodDB, grams: number): FoodEntry {
  const r = grams / 100
  return {
    foodId: food.id,
    foodName: food.name,
    grams,
    calories: Math.round(food.cal * r),
    protein:  Math.round(food.p   * r * 10) / 10,
    fat:      Math.round(food.f   * r * 10) / 10,
    carbs:    Math.round(food.c   * r * 10) / 10,
  }
}

// 栄養素バー
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

export default function Meal() {
  const { data, saveData } = useAppStore()
  const today = new Date().toISOString().slice(0, 10)

  const [mealType, setMealType] = useState<MealType>('breakfast')
  const [query, setQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodDB | null>(null)
  const [grams, setGrams] = useState('100')
  const [saving, setSaving] = useState(false)
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null)

  // 食品検索
  const results = useMemo(() => {
    if (!query.trim()) return []
    return FOOD_DB.filter((f) => f.name.includes(query)).slice(0, 10)
  }, [query])

  // 今日の食事ログ
  const todayLogs = data.mealLogs
    .filter((m) => m.date === today)
    .sort((a, b) => {
      const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
      return order.indexOf(a.mealType as MealType) - order.indexOf(b.mealType as MealType)
    })

  // 今日のトータル栄養素
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

  // 食品を食事ログに追加
  const handleAdd = async () => {
    if (!selectedFood) return
    const g = parseFloat(grams)
    if (isNaN(g) || g <= 0) return
    setSaving(true)
    try {
      const entry = calcEntry(selectedFood, g)
      const existing = data.mealLogs.find(
        (m) => m.date === today && m.mealType === mealType
      )
      let updatedLogs: MealLog[]
      if (existing) {
        updatedLogs = data.mealLogs.map((m) =>
          m.id === existing.id
            ? { ...m, entries: [...m.entries, entry] }
            : m
        )
      } else {
        const newLog: MealLog = {
          id: nanoid(),
          date: today,
          mealType,
          entries: [entry],
        }
        updatedLogs = [...data.mealLogs, newLog]
      }
      await saveData({ mealLogs: updatedLogs })
      setSelectedFood(null)
      setQuery('')
      setGrams('100')
    } finally {
      setSaving(false)
    }
  }

  // エントリー削除
  const handleDelete = async (logId: string, entryIdx: number) => {
    const updatedLogs = data.mealLogs
      .map((m) => {
        if (m.id !== logId) return m
        const entries = m.entries.filter((_, i) => i !== entryIdx)
        return { ...m, entries }
      })
      .filter((m) => m.entries.length > 0)
    await saveData({ mealLogs: updatedLogs })
  }

  const preview = selectedFood && grams ? calcEntry(selectedFood, parseFloat(grams) || 0) : null

  return (
    <div className="p-4 space-y-4">

      {/* 今日のカロリーサマリー */}
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
        {/* PFCバー */}
        <div className="space-y-2">
          <NutrientBar label="タンパク質" value={totals.protein} unit="g" color="bg-blue-400"   max={Math.round(goalCal * 0.25 / 4)} />
          <NutrientBar label="脂質"       value={totals.fat}     unit="g" color="bg-yellow-400" max={Math.round(goalCal * 0.25 / 9)} />
          <NutrientBar label="炭水化物"   value={totals.carbs}   unit="g" color="bg-orange-400" max={Math.round(goalCal * 0.55 / 4)} />
        </div>
      </div>

      {/* 食事追加フォーム */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">食事を追加</h2>

        {/* 食事タイプ選択 */}
        <div className="flex gap-2 mb-3">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((t) => (
            <button
              key={t}
              onClick={() => setMealType(t)}
              className={`flex-1 py-1.5 text-xs rounded-lg transition ${
                mealType === t ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {MEAL_LABELS[t]}
            </button>
          ))}
        </div>

        {/* 食品検索 */}
        <div className="relative mb-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedFood(null) }}
            placeholder="食品名で検索（例: 鶏むね、ご飯）"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {/* 検索結果 */}
        {results.length > 0 && !selectedFood && (
          <ul className="border border-gray-100 rounded-xl overflow-hidden mb-2 max-h-48 overflow-y-auto">
            {results.map((food) => (
              <li key={food.id}>
                <button
                  className="w-full text-left px-3 py-2.5 hover:bg-green-50 border-b border-gray-50 last:border-0"
                  onClick={() => { setSelectedFood(food); setQuery(food.name) }}
                >
                  <p className="text-sm font-medium text-gray-700">{food.name}</p>
                  <p className="text-xs text-gray-400">
                    {food.cal}kcal / P:{food.p}g / F:{food.f}g / C:{food.c}g （100gあたり）
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* グラム入力 & プレビュー */}
        {selectedFood && (
          <div className="space-y-2 mt-2">
            <div className="bg-green-50 rounded-xl px-3 py-2 text-sm text-green-700 font-medium">
              ✓ {selectedFood.name}
            </div>
            <label className="block">
              <span className="text-xs text-gray-500">量 (g)</span>
              <input
                type="number"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                className="mt-1 block w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </label>

            {/* 栄養素プレビュー */}
            {preview && (
              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div><p className="font-bold text-gray-700">{preview.calories}</p><p className="text-gray-400">kcal</p></div>
                <div><p className="font-bold text-blue-500">{preview.protein}g</p><p className="text-gray-400">P</p></div>
                <div><p className="font-bold text-yellow-500">{preview.fat}g</p><p className="text-gray-400">F</p></div>
                <div><p className="font-bold text-orange-500">{preview.carbs}g</p><p className="text-gray-400">C</p></div>
              </div>
            )}

            {/* 五大栄養素詳細 */}
            {preview && grams && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer text-green-600 font-medium py-1">五大栄養素の詳細を見る</summary>
                <div className="mt-2 grid grid-cols-2 gap-1 bg-gray-50 rounded-xl p-3">
                  {[
                    { label: '食物繊維', value: Math.round(selectedFood.fiber * parseFloat(grams) / 100 * 10) / 10, unit: 'g' },
                    { label: 'ビタミンA', value: Math.round(selectedFood.vitA  * parseFloat(grams) / 100), unit: 'μgRAE' },
                    { label: 'ビタミンC', value: Math.round(selectedFood.vitC  * parseFloat(grams) / 100), unit: 'mg' },
                    { label: 'ビタミンD', value: Math.round(selectedFood.vitD  * parseFloat(grams) / 100 * 10) / 10, unit: 'μg' },
                    { label: 'カルシウム', value: Math.round(selectedFood.ca * parseFloat(grams) / 100), unit: 'mg' },
                    { label: '鉄',        value: Math.round(selectedFood.fe * parseFloat(grams) / 100 * 10) / 10, unit: 'mg' },
                    { label: 'ナトリウム', value: Math.round(selectedFood.na * parseFloat(grams) / 100), unit: 'mg' },
                  ].map(({ label, value, unit }) => (
                    <div key={label} className="flex justify-between">
                      <span>{label}</span>
                      <span className="font-medium text-gray-700">{value}{unit}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <button
              onClick={handleAdd}
              disabled={saving}
              className="w-full bg-green-500 text-white rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-green-600 transition"
            >
              <Plus size={16} />
              {MEAL_LABELS[mealType]}に追加
            </button>
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
                  <button
                    className="w-full flex justify-between items-center px-3 py-2.5 hover:bg-gray-50"
                    onClick={() => setExpandedMeal(isOpen ? null : log.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        {MEAL_LABELS[log.mealType as MealType]}
                      </span>
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
                            <button
                              onClick={() => handleDelete(log.id, idx)}
                              className="text-gray-300 hover:text-red-400 transition"
                            >
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
