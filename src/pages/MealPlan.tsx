import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, ExternalLink, RefreshCw, ArrowLeft, Sparkles, BookOpen, Plus } from 'lucide-react'
import { useAppStore } from '../lib/store'
import { getApiKey } from '../lib/gemini'
import { generateWeeklyMealPlan, loadSavedMealPlan } from '../lib/mealplan'
import { useRecipeStore } from '../lib/recipedb'
import type { WeeklyMealPlan, DayMealPlan, MealPlanDish, DinnerPlan } from '../types'
import type { AiFoodResult } from '../lib/gemini'

function dishToEntry(d: MealPlanDish): AiFoodResult {
  return {
    name: d.name,
    grams: 0,
    calories: d.calories,
    protein: d.protein,
    fat: d.fat,
    carbs: d.carbs,
    fiber: 0, vitA: 0, vitC: 0, vitD: 0, ca: 0, fe: 0,
    // 食塩相当量(g) → Na(mg)
    na: d.sodium != null ? Math.round(d.sodium * 393) : 0,
  }
}

function calcDayTotal(day: DayMealPlan): number {
  const bfCal = day.breakfast.reduce((s, d) => s + d.calories, 0)
  const lCal  = day.lunch.reduce((s, d) => s + d.calories, 0)
  const dCal  = day.dinner.main.calories + day.dinner.staple.calories +
    day.dinner.sides.reduce((s, d) => s + d.calories, 0) +
    (day.dinner.soup?.calories ?? 0)
  const sCal  = (day.snack ?? []).reduce((s, d) => s + d.calories, 0)
  return bfCal + lCal + dCal + sCal
}

function calcMacros(dishes: MealPlanDish[]) {
  return dishes.reduce(
    (acc, d) => ({ p: acc.p + d.protein, f: acc.f + d.fat, c: acc.c + d.carbs, s: acc.s + (d.sodium ?? 0) }),
    { p: 0, f: 0, c: 0, s: 0 }
  )
}

function DishRow({ dish }: { dish: MealPlanDish }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-gray-50 last:border-0 gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 leading-snug">{dish.name}</p>
        {dish.note && <p className="text-xs text-gray-400 mt-0.5">{dish.note}</p>}
        <p className="text-xs text-gray-400">
          P:{Math.round(dish.protein * 10) / 10}g F:{Math.round(dish.fat * 10) / 10}g C:{Math.round(dish.carbs * 10) / 10}g
          {dish.sodium != null && <> 塩:{Math.round(dish.sodium * 10) / 10}g</>}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs font-medium text-gray-600">{dish.calories}kcal</span>
        {dish.searchUrl && (
          <a href={dish.searchUrl} target="_blank" rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-600 transition" title="おいしい健康でレシピを検索">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  )
}

function DinnerSection({ dinner, onAdd }: { dinner: DinnerPlan; onAdd?: () => void }) {
  const totalCal = dinner.main.calories + dinner.staple.calories +
    dinner.sides.reduce((s, d) => s + d.calories, 0) +
    (dinner.soup?.calories ?? 0)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs font-semibold text-orange-500">夕食</span>
        <span className="text-xs text-gray-400 ml-auto">{totalCal}kcal</span>
        {onAdd && (
          <button onClick={onAdd}
            className="ml-2 flex items-center gap-0.5 text-[10px] text-green-600 border border-green-200 rounded-lg px-1.5 py-0.5 hover:bg-green-50 transition">
            <Plus size={10} />食事に登録
          </button>
        )}
      </div>
      <div className="pl-2 border-l-2 border-orange-100 space-y-0.5">
        <p className="text-[10px] text-orange-400 font-medium">主菜</p>
        <DishRow dish={dinner.main} />
        <p className="text-[10px] text-orange-400 font-medium mt-1">主食</p>
        <DishRow dish={dinner.staple} />
        {dinner.sides.length > 0 && (
          <>
            <p className="text-[10px] text-orange-400 font-medium mt-1">副菜</p>
            {dinner.sides.map((s, i) => <DishRow key={i} dish={s} />)}
          </>
        )}
        {dinner.soup && (
          <>
            <p className="text-[10px] text-orange-400 font-medium mt-1">汁物</p>
            <DishRow dish={dinner.soup} />
          </>
        )}
      </div>
    </div>
  )
}

function MealSection({ label, dishes, color, onAdd }: {
  label: string; dishes: MealPlanDish[]; color: string; onAdd?: () => void
}) {
  if (!dishes || dishes.length === 0) return null
  const total = dishes.reduce((s, d) => s + d.calories, 0)
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 mb-1">
        <span className={`text-xs font-semibold ${color}`}>{label}</span>
        <span className="text-xs text-gray-400 ml-auto">{total}kcal</span>
        {onAdd && (
          <button onClick={onAdd}
            className="ml-2 flex items-center gap-0.5 text-[10px] text-green-600 border border-green-200 rounded-lg px-1.5 py-0.5 hover:bg-green-50 transition">
            <Plus size={10} />食事に登録
          </button>
        )}
      </div>
      {dishes.map((d, i) => <DishRow key={i} dish={d} />)}
    </div>
  )
}

function DayCard({ day, index }: { day: DayMealPlan; index: number }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(index === 0)
  const total = calcDayTotal(day)
  const allDishes = [
    ...day.breakfast,
    ...day.lunch,
    day.dinner.main, day.dinner.staple, ...day.dinner.sides,
    ...(day.dinner.soup ? [day.dinner.soup] : []),
    ...(day.snack ?? []),
  ]
  const macros = calcMacros(allDishes)

  const goMeal = (dishes: MealPlanDish[], mealType: string) =>
    navigate('/meal', { state: { pendingEntries: dishes.map(dishToEntry), mealType } })

  const dinnerDishes = [
    day.dinner.main, day.dinner.staple, ...day.dinner.sides,
    ...(day.dinner.soup ? [day.dinner.soup] : []),
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-700">{day.dayLabel}</span>
          <span className="text-xs text-gray-400">
            P:{Math.round(macros.p)}g F:{Math.round(macros.f)}g C:{Math.round(macros.c)}g 塩:{Math.round(macros.s * 10) / 10}g
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-green-600">{total}kcal</span>
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-4">
          <MealSection label="朝食" dishes={day.breakfast} color="text-yellow-500"
            onAdd={day.breakfast.length > 0 ? () => goMeal(day.breakfast, 'breakfast') : undefined} />
          <MealSection label="昼食" dishes={day.lunch} color="text-blue-500"
            onAdd={day.lunch.length > 0 ? () => goMeal(day.lunch, 'lunch') : undefined} />
          <DinnerSection dinner={day.dinner}
            onAdd={() => goMeal(dinnerDishes, 'dinner')} />
          {day.snack && day.snack.length > 0 && (
            <MealSection label="間食" dishes={day.snack} color="text-purple-500"
              onAdd={() => goMeal(day.snack!, 'snack')} />
          )}
        </div>
      )}
    </div>
  )
}

export default function MealPlan() {
  const navigate = useNavigate()
  const { data } = useAppStore()
  const { db: recipeDB, loadDB } = useRecipeStore()
  const hasApiKey = !!getApiKey()

  useEffect(() => { loadDB() }, [loadDB])

  const [plan, setPlan] = useState<WeeklyMealPlan | null>(() => loadSavedMealPlan())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goalCalories = data.settings.goalCalories ?? 2000

  useEffect(() => {
    const saved = loadSavedMealPlan()
    if (saved) setPlan(saved)
  }, [])

  const handleGenerate = async () => {
    setError(null)
    setGenerating(true)
    try {
      const newPlan = await generateWeeklyMealPlan(goalCalories, recipeDB.recipes)
      setPlan(newPlan)
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
        <h1 className="text-lg font-bold text-gray-800">週間献立プラン</h1>
        <button
          onClick={() => navigate('/recipedb')}
          className="ml-auto flex items-center gap-1 text-xs text-green-600 border border-green-200 rounded-xl px-3 py-1.5 hover:bg-green-50 transition"
        >
          <BookOpen size={13} />
          レシピDB
        </button>
      </div>

      {/* 目標カロリー表示 */}
      <div className="bg-green-50 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-green-600 font-medium">目標摂取カロリー</p>
          <p className="text-2xl font-bold text-green-700">{goalCalories}<span className="text-sm font-normal ml-1">kcal/日</span></p>
        </div>
        {plan && (
          <p className="text-xs text-gray-400">
            生成: {new Date(plan.createdAt).toLocaleDateString('ja-JP')}
          </p>
        )}
      </div>

      {/* APIキー未設定 */}
      {!hasApiKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-center">
          <p className="text-sm text-amber-700 font-medium mb-1">APIキーが必要です</p>
          <p className="text-xs text-amber-600">設定画面でGemini APIキーを登録してください</p>
          <button
            onClick={() => navigate('/settings')}
            className="mt-3 text-sm text-amber-700 underline"
          >
            設定画面へ
          </button>
        </div>
      )}

      {/* 生成ボタン */}
      {hasApiKey && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full bg-green-500 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-green-600 transition active:scale-95"
        >
          {generating ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              献立を生成中... (少し時間がかかります)
            </>
          ) : (
            <>
              <Sparkles size={18} />
              {plan ? '献立を再生成する' : '1週間の献立を生成する'}
            </>
          )}
        </button>
      )}

      {/* エラー */}
      {error && (
        <div className="bg-red-50 text-red-500 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* 献立表示 */}
      {plan && !generating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600">7日間の献立</h2>
            <p className="text-xs text-gray-400">目標 {plan.goalCalories}kcal 基準</p>
          </div>
          {plan.days.map((day, i) => (
            <DayCard key={i} day={day} index={i} />
          ))}
          <p className="text-xs text-center text-gray-400 pb-2">
            <ExternalLink size={10} className="inline mr-1" />
            料理名横のアイコンから「おいしい健康」でレシピを検索できます
          </p>
        </div>
      )}

      {/* 初期状態（未生成） */}
      {!plan && !generating && hasApiKey && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🍱</p>
          <p className="text-sm">上のボタンで1週間分の献立を</p>
          <p className="text-sm">AIが自動生成します</p>
        </div>
      )}
    </div>
  )
}
