import { useState, useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { localDateStr } from '../lib/utils'
import { useAppStore } from '../lib/store'
import { getDailyAdvice, getWeeklyAdvice } from '../lib/advice'
import { hasAiKey } from '../lib/ai'
import type { AdviceLog } from '../types'
import { computeTrophies, TIER_COLORS } from '../lib/trophies'
import { computeAllStreaks, STREAK_CATEGORIES, STREAK_CATEGORY_META, type DayStatus, type StreakCategory, type StreakInfo } from '../lib/streak'
import QuickExerciseCard from '../components/QuickExerciseCard'
import SelfCareCard from '../components/SelfCareCard'
import RewardCard from '../components/RewardCard'
import StockCard from '../components/StockCard'
import { Sparkles, RefreshCw, Moon, Footprints, Dumbbell, Trophy, Scale, Plus, ChevronDown } from 'lucide-react'
import type { AppData, MealLog } from '../types'

function todayStr() {
  return localDateStr()
}

export default function Home() {
  const data = useAppStore(s => s.data)
  const [today, setToday] = useState(todayStr)

  // 日付が変わったら today を更新（1分ごとにチェック）
  useEffect(() => {
    const timer = setInterval(() => {
      const newToday = todayStr()
      setToday(prev => prev !== newToday ? newToday : prev)
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const todayBody     = data.bodyRecords.find((r) => r.date === today)
  const todayMeals    = data.mealLogs.filter((m) => m.date === today)
  const todayCardio   = data.cardioLogs.filter((c) => c.date === today)
  const todayStrength = data.strengthLogs.filter((s) => s.date === today)
  const todaySleep    = (data.sleepLogs ?? []).filter((s) => s.date === today)
  // 歩数：今日のデータがなければ最新日のデータを表示
  const sortedStepLogs = (data.stepLogs ?? []).slice().sort((a, b) => b.date.localeCompare(a.date))
  const latestStepLog  = sortedStepLogs[0]
  const todayStepLog   = sortedStepLogs.find(s => s.date === today)
  const displayStepLog = todayStepLog ?? latestStepLog
  const todaySteps     = displayStepLog?.steps ?? 0
  const stepsIsToday   = displayStepLog?.date === today

  // 歩数の消費カロリー推定（体重 × 歩数 × 0.0005 kcal）
  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? 60
  const stepsCalories = Math.round(todaySteps * weightKg * 0.0005)

  const totalCaloriesIn = todayMeals.reduce(
    (sum, m) => sum + m.entries.reduce((s, e) => s + e.calories, 0), 0
  )
  const exerciseKcal =
    todayCardio.reduce((sum, c) => sum + c.caloriesBurned, 0) +
    todayStrength.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0)
  const totalCaloriesOut =
    exerciseKcal +
    (stepsIsToday ? stepsCalories : 0)

  // 今日の合計PFC・塩分
  const allEntries = todayMeals.flatMap(m => m.entries)
  const totalProtein = allEntries.reduce((s, e) => s + e.protein, 0)
  const totalFat     = allEntries.reduce((s, e) => s + e.fat, 0)
  const totalCarbs   = allEntries.reduce((s, e) => s + e.carbs, 0)
  const totalSodium  = allEntries.reduce((s, e) => s + (e.sodium ?? 0), 0)
  const totalSaltG   = totalSodium * 2.54 / 1000 // ナトリウム→食塩相当量

  // 睡眠合計
  const totalSleepMin = todaySleep.reduce((s, r) => s + r.durationMin, 0)

  const goal      = data.settings.goalCalories ?? 2000
  const remaining = goal - totalCaloriesIn + totalCaloriesOut

  // PFC 目標レンジ（合計が目標カロリーと一致するよう逆算）
  const goalProteinLow  = Math.round(weightKg * 1.6)
  const goalProteinHigh = Math.round(weightKg * 2.0)
  const goalFatLow      = Math.round(goal * 0.20 / 9)
  const goalFatHigh     = Math.round(goal * 0.30 / 9)
  const goalCarbsLow    = Math.round(Math.max(0, goal - goalProteinHigh * 4 - goalFatHigh * 9) / 4)
  const goalCarbsHigh   = Math.round(Math.max(0, goal - goalProteinLow  * 4 - goalFatLow  * 9) / 4)

  return (
    <div className="p-4 space-y-4">

      {/* 今日のまとめ（カロリー＋体重・睡眠・歩数・運動） */}
      <TodaySummaryCard
        goal={goal}
        caloriesIn={totalCaloriesIn}
        caloriesOut={totalCaloriesOut}
        remaining={remaining}
        weight={todayBody?.weight}
        bodyFatPct={todayBody?.bodyFatPct}
        sleepMin={totalSleepMin}
        steps={displayStepLog ? todaySteps : undefined}
        stepsLabel={stepsIsToday || !displayStepLog ? '歩数' : `歩数(${displayStepLog.date.slice(5).replace('-', '/')})`}
        exerciseKcal={exerciseKcal}
        exerciseCount={todayCardio.length + todayStrength.length}
      />

      {/* 日用品（要購入・今週の棚卸し）：あるときだけ出る */}
      <StockCard />

      <SectionTitle>習慣</SectionTitle>
      {/* 連続記録 */}
      <StreakCard data={data} today={today} />
      {/* セルフケア（歯磨き・入浴・スキンケア） */}
      <SelfCareCard />
      {/* ちょっとだけ運動 */}
      <QuickExerciseCard date={today} />

      <SectionTitle>食事</SectionTitle>
      <MealSummaryCard
        meals={todayMeals}
        totals={{ protein: totalProtein, fat: totalFat, carbs: totalCarbs, salt: totalSaltG }}
        goals={{
          protein: [goalProteinLow, goalProteinHigh],
          fat:     [goalFatLow, goalFatHigh],
          carbs:   [goalCarbsLow, goalCarbsHigh],
        }}
      />

      <SectionTitle>ごほうび・ふりかえり</SectionTitle>
      {/* ご褒美 */}
      <RewardCard />
      {/* トロフィー */}
      <TrophySection data={data} />
      {/* AIアドバイス */}
      <AdviceCard today={today} />

    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold text-gray-400 px-1 pt-2 -mb-1">{children}</h2>
}

function TodaySummaryCard({
  goal, caloriesIn, caloriesOut, remaining,
  weight, bodyFatPct, sleepMin, steps, stepsLabel, exerciseKcal, exerciseCount,
}: {
  goal: number
  caloriesIn: number
  caloriesOut: number
  remaining: number
  weight?: number
  bodyFatPct?: number
  sleepMin: number
  steps?: number
  stepsLabel: string
  exerciseKcal: number
  exerciseCount: number
}) {
  // 摂取が「目標＋消費」のどこまで来たか
  const budget = Math.max(1, goal + caloriesOut)
  const ratio = Math.min(1, caloriesIn / budget)
  const over = remaining < 0

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-4">
        <p className="text-xs text-white/80">
          {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
        </p>
        <div className="flex items-end justify-between gap-2 mt-1">
          <div>
            <p className="text-xs text-white/80">{over ? '目標をオーバー' : 'あと食べられる'}</p>
            <p className="leading-none mt-1">
              <span className="text-4xl font-bold tabular-nums">{Math.abs(remaining).toLocaleString()}</span>
              <span className="text-sm ml-1">kcal</span>
            </p>
          </div>
          <Link to="/meal" className="flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-semibold shrink-0">
            <Plus size={14} /> 食事を記録
          </Link>
        </div>
        <div className="h-2 rounded-full bg-white/25 mt-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${over ? 'bg-red-300' : 'bg-white'}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-white/90 mt-1.5 tabular-nums">
          <span>摂取 <b>{caloriesIn.toLocaleString()}</b></span>
          <span>消費 <b>{caloriesOut.toLocaleString()}</b></span>
          <span>目標 <b>{goal.toLocaleString()}</b></span>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-gray-100">
        <MiniStat
          to="/body" icon={<Scale size={14} className="text-blue-400" />} label="体重"
          value={weight != null ? weight.toFixed(1) : undefined} unit="kg"
          sub={bodyFatPct != null ? `${bodyFatPct}%` : undefined}
        />
        <MiniStat
          to="/report" icon={<Moon size={14} className="text-indigo-400" />} label="睡眠"
          value={sleepMin > 0 ? `${Math.floor(sleepMin / 60)}:${String(sleepMin % 60).padStart(2, '0')}` : undefined}
        />
        <MiniStat
          to="/report" icon={<Footprints size={14} className="text-teal-400" />} label={stepsLabel}
          value={steps != null ? steps.toLocaleString() : undefined}
        />
        <MiniStat
          to="/exercise" icon={<Dumbbell size={14} className="text-orange-400" />} label="運動"
          value={exerciseCount > 0 ? String(exerciseKcal) : undefined} unit="kcal"
          sub={exerciseCount > 0 ? `${exerciseCount}件` : undefined}
        />
      </div>
    </div>
  )
}

function MiniStat({
  to, icon, label, value, unit, sub,
}: { to: string; icon: ReactNode; label: string; value?: string; unit?: string; sub?: string }) {
  return (
    <Link to={to} className="flex flex-col items-center justify-center py-3 px-1 min-w-0 hover:bg-gray-50 active:bg-gray-50 transition">
      <span className="flex items-center gap-1 text-[10px] text-gray-400 whitespace-nowrap">{icon}{label}</span>
      {value != null ? (
        <span className="mt-1 text-base font-bold text-gray-800 tabular-nums leading-tight truncate max-w-full">
          {value}{unit && <span className="text-[10px] font-normal text-gray-400 ml-0.5">{unit}</span>}
        </span>
      ) : (
        <span className="mt-1 text-sm text-gray-300 leading-tight">未記録</span>
      )}
      <span className="text-[10px] text-gray-400 h-3.5 leading-3.5">{sub ?? ''}</span>
    </Link>
  )
}

const MEAL_TYPES: { type: MealLog['mealType']; label: string; icon: string }[] = [
  { type: 'breakfast', label: '朝食', icon: '🌅' },
  { type: 'lunch',     label: '昼食', icon: '☀️' },
  { type: 'dinner',    label: '夕食', icon: '🌙' },
  { type: 'snack',     label: '間食', icon: '🍪' },
]

function MealSummaryCard({
  meals, totals, goals,
}: {
  meals: MealLog[]
  totals: { protein: number; fat: number; carbs: number; salt: number }
  goals: { protein: [number, number]; fat: [number, number]; carbs: [number, number] }
}) {
  const [openType, setOpenType] = useState<MealLog['mealType'] | null>(null)

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      {/* PFC・塩分 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <NutrientBar label="たんぱく質" value={totals.protein} low={goals.protein[0]} high={goals.protein[1]} color="bg-blue-400" />
        <NutrientBar label="脂質"       value={totals.fat}     low={goals.fat[0]}     high={goals.fat[1]}     color="bg-yellow-400" />
        <NutrientBar label="炭水化物"   value={totals.carbs}   low={goals.carbs[0]}   high={goals.carbs[1]}   color="bg-orange-400" />
        <NutrientBar label="塩分"       value={totals.salt}    low={0}                high={6}                color="bg-red-300" maxOnly />
      </div>

      {/* 食事ごと（タップで中身を開く） */}
      <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
        {MEAL_TYPES.map(({ type, label, icon }) => {
          const entries = meals.filter(m => m.mealType === type).flatMap(m => m.entries)
          const cal = entries.reduce((s, e) => s + e.calories, 0)
          const open = openType === type && entries.length > 0
          return (
            <div key={type}>
              <button
                onClick={() => setOpenType(open ? null : type)}
                disabled={entries.length === 0}
                className="w-full flex items-center gap-2 py-2.5 text-left"
              >
                <span className="text-base w-6 text-center">{icon}</span>
                <span className="text-sm font-medium text-gray-700 shrink-0">{label}</span>
                {entries.length > 0 ? (
                  <>
                    <span className="text-xs text-gray-400 truncate flex-1 min-w-0">
                      {entries.map(e => e.foodName).join('、')}
                    </span>
                    <span className="text-sm font-bold text-green-600 tabular-nums shrink-0">{cal} kcal</span>
                    <ChevronDown size={16} className={`text-gray-300 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
                  </>
                ) : (
                  <span className="text-xs text-gray-300 flex-1">未記録</span>
                )}
              </button>
              {open && (
                <ul className="text-xs text-gray-500 pb-2.5 pl-8 space-y-0.5">
                  {entries.map((e, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{e.foodName}（{e.grams}g）</span>
                      <span className="tabular-nums shrink-0">{e.calories}kcal</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <Link to="/meal" className="mt-2 flex items-center justify-center gap-1 rounded-xl bg-green-50 text-green-700 text-sm font-semibold py-2 hover:bg-green-100 transition">
        <Plus size={16} /> 食事を記録する
      </Link>
    </div>
  )
}

/** 栄養素の摂取量と目標レンジ。レンジ内なら緑、超えたら赤 */
function NutrientBar({
  label, value, low, high, color, maxOnly = false,
}: { label: string; value: number; low: number; high: number; color: string; maxOnly?: boolean }) {
  const over = value > high
  const inRange = !over && value >= low && value > 0
  const ratio = Math.min(1, value / Math.max(1, high))
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[11px] text-gray-500 whitespace-nowrap">{label}</span>
        <span className={`text-xs font-bold tabular-nums whitespace-nowrap ${over ? 'text-red-500' : inRange ? 'text-green-600' : 'text-gray-600'}`}>
          {value.toFixed(1)}<span className="text-[10px] font-normal text-gray-400">/{maxOnly ? `${high}以下` : `${low}〜${high}`}g</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
        <div className={`h-full rounded-full ${over ? 'bg-red-500' : color}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

function AdviceCard({ today }: { today: string }) {
  const { data, saveData } = useAppStore()
  const hasApiKey = hasAiKey()
  const [dailyAdvice,   setDailyAdvice]   = useState<string | null>(null)
  const [weeklyAdvice,  setWeeklyAdvice]  = useState<string | null>(null)
  const [adviceScore,   setAdviceScore]   = useState<number | null>(null)
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [adviceError,   setAdviceError]   = useState<string | null>(null)

  const handleAdvice = async () => {
    setAdviceLoading(true)
    setDailyAdvice(null)
    setWeeklyAdvice(null)
    setAdviceScore(null)
    setAdviceError(null)
    try {
      const [daily, w] = await Promise.all([
        getDailyAdvice(data),
        getWeeklyAdvice(data),
      ])
      const d = daily.advice
      const score = daily.score
      setDailyAdvice(d || null)
      setWeeklyAdvice(w || null)
      setAdviceScore(score || null)
      if (d || w) {
        const log: AdviceLog = {
          id: crypto.randomUUID(),
          date: today,
          createdAt: new Date().toISOString(),
          daily: d ?? '',
          weekly: w ?? '',
          score: score || undefined,
        }
        const existing = (data.adviceLogs ?? []).filter(a => a.date !== today)
        await saveData({ adviceLogs: [...existing, log] })
      }
    } catch (e) {
      setAdviceError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdviceLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-gray-700 flex items-center gap-1.5">
          <Sparkles size={16} className="text-purple-400" /> AIアドバイス
        </h2>
        {hasApiKey && (
          <button
            onClick={handleAdvice}
            disabled={adviceLoading}
            className="flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-600 hover:bg-purple-100 disabled:opacity-40 transition"
          >
            <RefreshCw size={12} className={adviceLoading ? 'animate-spin' : ''} />
            {adviceLoading ? '生成中...' : '今すぐ取得'}
          </button>
        )}
      </div>

      {!hasApiKey && (
        <Link to="/settings?s=ai" className="text-xs text-gray-400 underline">設定でAPIキーを登録するとアドバイスが表示されます</Link>
      )}

      {hasApiKey && !dailyAdvice && !weeklyAdvice && !adviceLoading && !adviceError && (
        <p className="text-xs text-gray-400">「今すぐ取得」を押すと、今日と今週の記録からAIがアドバイスします</p>
      )}

      {adviceLoading && (
        <p className="text-sm text-gray-400 animate-pulse">アドバイスを生成中...</p>
      )}

      {adviceError && (
        <p className="text-xs text-red-500 break-all">✗ {adviceError}</p>
      )}

      {adviceScore != null && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-purple-50 rounded-xl">
          <div className="text-center shrink-0">
            <p className={`text-3xl font-bold ${adviceScore >= 80 ? 'text-green-500' : adviceScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
              {adviceScore}
            </p>
            <p className="text-xs text-gray-400">/ 100点</p>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-purple-600">今日の健康スコア</p>
            <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${adviceScore >= 80 ? 'bg-green-500' : adviceScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${adviceScore}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {dailyAdvice && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-purple-600 mb-1">📅 今日の総括</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{dailyAdvice}</p>
        </div>
      )}

      {weeklyAdvice && (
        <div className={dailyAdvice ? 'pt-3 border-t border-gray-100' : ''}>
          <p className="text-xs font-semibold text-indigo-600 mb-1">📊 今週の総括</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{weeklyAdvice}</p>
        </div>
      )}
    </div>
  )
}

function TrophySection({ data }: { data: AppData }) {
  const trophies = computeTrophies(data)
  const earned   = trophies.filter(t => t.earned)
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setOpen(o => !o)}
      >
        <h2 className="text-sm font-semibold text-gray-500 flex items-center gap-1.5">
          <Trophy size={14} className="text-yellow-500" />
          トロフィー
          <span className="ml-1 bg-yellow-100 text-yellow-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {earned.length}/{trophies.length}
          </span>
        </h2>
        <span className="text-xs text-gray-400">{open ? '閉じる' : '開く'}</span>
      </button>

      {/* 獲得済みプレビュー（常時表示） */}
      {earned.length > 0 && !open && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {earned.slice(0, 5).map(t => (
            <span key={t.id} title={t.title} className="text-xl">{t.icon}</span>
          ))}
          {earned.length > 5 && (
            <span className="text-xs text-gray-400 self-center">+{earned.length - 5}</span>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {trophies.map(t => (
            <div key={t.id}
              className={`flex items-center gap-3 border rounded-xl px-3 py-2 transition
                ${t.earned ? TIER_COLORS[t.tier] : 'bg-gray-50 border-gray-100 opacity-50'}`}>
              <span className="text-2xl">{t.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{t.title}</p>
                <p className="text-xs opacity-70">{t.description}</p>
              </div>
              {t.earned && (
                <span className="text-xs font-bold shrink-0">
                  {t.tier === 'gold' ? '🥇' : t.tier === 'silver' ? '🥈' : '🥉'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const DAY_STATUS_STYLE: Record<DayStatus, string> = {
  recorded: 'bg-orange-400 text-white',
  frozen:   'bg-sky-100 text-sky-500',
  missed:   'bg-gray-100 text-gray-300',
  pending:  'border-2 border-dashed border-orange-300 text-orange-400',
}

function StreakCard({ data, today }: { data: AppData; today: string }) {
  const streaks = computeAllStreaks(data, today)
  const remaining = STREAK_CATEGORIES.filter(c => !streaks[c].todayRecorded)

  let message: string
  if (remaining.length === 0) {
    message = '今日は全部記録済み！この調子で続けよう'
  } else {
    const atRisk = remaining.filter(c => streaks[c].current > 0)
    message = atRisk.length > 0
      ? `まだ：${atRisk.map(c => STREAK_CATEGORY_META[c].label).join('・')}（記録すると連続が伸びます）`
      : `まだ：${remaining.map(c => STREAK_CATEGORY_META[c].label).join('・')}`
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-gray-700">🔥 連続記録</h2>
        <p className="text-[10px] text-gray-400" title="記録できなかった日を、カテゴリごとに週1回まで自動でカバーします">
          🧊 フリーズは各カテゴリ週1回
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {STREAK_CATEGORIES.map(c => (
          <StreakRow key={c} category={c} streak={streaks[c]} today={today} />
        ))}
      </div>

      <p className={`text-xs mt-2 ${remaining.length === 0 ? 'text-green-600' : 'text-orange-500 font-semibold'}`}>
        {message}
      </p>
    </div>
  )
}

function StreakRow({ category, streak, today }: { category: StreakCategory; streak: StreakInfo; today: string }) {
  const meta = STREAK_CATEGORY_META[category]
  const weekday = (date: string) =>
    new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', { weekday: 'narrow' })

  return (
    <div className="flex items-center gap-2 py-2" title={meta.hint}>
      <div className="w-[5.5rem] shrink-0 whitespace-nowrap">
        <p className="text-xs text-gray-600">{meta.icon} {meta.label}</p>
        <p className="text-[10px] text-gray-400">最長{streak.best}・🧊{streak.freezesLeftThisWeek}</p>
      </div>
      <div className="w-14 shrink-0 text-right whitespace-nowrap">
        <span className="text-xl font-bold text-orange-500">{streak.current}</span>
        <span className="text-[10px] text-gray-500">日</span>
      </div>
      {/* 画面が狭いときは丸が縮む（幅は最大 1.5rem） */}
      <div className="flex-1 min-w-0 grid grid-cols-7 gap-0.5 pl-1">
        {streak.recent.map(({ date, status }) => (
          <div key={date} className="flex flex-col items-center gap-0.5 min-w-0">
            <span className={`w-full max-w-6 aspect-square rounded-full flex items-center justify-center text-[11px] ${DAY_STATUS_STYLE[status]}`}>
              {status === 'recorded' ? '✓' : status === 'frozen' ? '🧊' : ''}
            </span>
            <span className={`text-[9px] ${date === today ? 'text-orange-500 font-bold' : 'text-gray-400'}`}>
              {date === today ? '今日' : weekday(date)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
