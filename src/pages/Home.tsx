import { useState, useEffect } from 'react'
import { localDateStr } from '../lib/utils'
import { useAppStore } from '../lib/store'
import { getDailyAdvice, getWeeklyAdvice } from '../lib/advice'
import { getApiKey } from '../lib/gemini'
import { Sparkles, RefreshCw, Moon, Footprints, Dumbbell } from 'lucide-react'

function todayStr() {
  return localDateStr()
}

export default function Home() {
  const { data } = useAppStore()
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
  const totalCaloriesOut =
    todayCardio.reduce((sum, c) => sum + c.caloriesBurned, 0) +
    todayStrength.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0) +
    stepsCalories

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

  const hasApiKey = !!getApiKey()

  // アドバイス
  const [dailyAdvice,   setDailyAdvice]   = useState<string | null>(null)
  const [weeklyAdvice,  setWeeklyAdvice]  = useState<string | null>(null)
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [adviceError,   setAdviceError]   = useState<string | null>(null)

  const handleAdvice = async () => {
    setAdviceLoading(true)
    setDailyAdvice(null)
    setWeeklyAdvice(null)
    setAdviceError(null)
    try {
      const [d, w] = await Promise.all([
        getDailyAdvice(data),
        getWeeklyAdvice(data),
      ])
      setDailyAdvice(d || null)
      setWeeklyAdvice(w || null)
    } catch (e) {
      setAdviceError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdviceLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">

      {/* 日付 */}
      <div className="text-center py-2">
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('ja-JP', {
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
          })}
        </p>
      </div>

      {/* カロリーサマリー */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">今日のカロリー</h2>
        <div className="flex justify-around text-center">
          <Stat label="目標"   value={String(goal)}            color="text-blue-500" />
          <Stat label="摂取"   value={String(totalCaloriesIn)} color="text-green-500" />
          <Stat label="消費"   value={String(totalCaloriesOut)} color="text-orange-500" />
          <Stat label="残り"   value={String(remaining)}        color={remaining >= 0 ? 'text-gray-700' : 'text-red-500'} />
        </div>
      </div>

      {/* 体重 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">今日の体重</h2>
        {todayBody ? (
          <div className="flex gap-4">
            <StatText label="体重"   value={`${todayBody.weight.toFixed(2)} kg`} />
            {todayBody.bodyFatPct != null && <StatText label="体脂肪率" value={`${todayBody.bodyFatPct} %`} />}
            {todayBody.bmi        != null && <StatText label="BMI"      value={String(todayBody.bmi)} />}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">未記録</p>
        )}
      </div>

      {/* 睡眠 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
          <Moon size={14} className="text-indigo-400" /> 今日の睡眠
        </h2>
        {totalSleepMin > 0 ? (
          <div className="flex items-end gap-1">
            <span className="text-2xl font-bold text-indigo-500">
              {Math.floor(totalSleepMin / 60)}
            </span>
            <span className="text-sm text-gray-400 mb-0.5">時間</span>
            <span className="text-2xl font-bold text-indigo-500 ml-1">
              {totalSleepMin % 60}
            </span>
            <span className="text-sm text-gray-400 mb-0.5">分</span>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">未記録（Health Connect から同期できます）</p>
        )}
      </div>

      {/* 歩数 */}
      {displayStepLog && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
            <Footprints size={14} className="text-teal-400" />
            {stepsIsToday ? '今日の歩数' : `歩数（${displayStepLog.date}）`}
          </h2>
          <div className="flex items-end gap-4">
            <div>
              <span className="text-2xl font-bold text-teal-500">{todaySteps.toLocaleString()}</span>
              <span className="text-sm text-gray-400 ml-1">歩</span>
            </div>
            <div className="mb-0.5">
              <span className="text-sm text-orange-500 font-semibold">{stepsCalories} kcal</span>
              <span className="text-xs text-gray-400 ml-1">消費</span>
            </div>
          </div>
        </div>
      )}

      {/* 今日の運動 */}
      {(todayCardio.length > 0 || todayStrength.length > 0) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
            <Dumbbell size={14} className="text-orange-400" /> 今日の運動
          </h2>
          <div className="space-y-2">
            {todayCardio.map((c) => (
              <div key={c.id} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{c.name}</span>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>{c.durationMin}分</span>
                  <span className="text-orange-500 font-semibold">{c.caloriesBurned} kcal</span>
                </div>
              </div>
            ))}
            {todayStrength.map((s) => (
              <div key={s.id} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{s.name}</span>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>{s.sets.length}セット</span>
                  {s.estimatedCalories != null && (
                    <span className="text-orange-500 font-semibold">{s.estimatedCalories} kcal</span>
                  )}
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-100 flex justify-end">
              <span className="text-xs text-gray-500">合計消費 </span>
              <span className="text-sm font-bold text-orange-500 ml-1">
                {todayCardio.reduce((s, c) => s + c.caloriesBurned, 0) +
                 todayStrength.reduce((s, t) => s + (t.estimatedCalories ?? 0), 0)} kcal
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 今日の食事 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">今日の食事</h2>
        {todayMeals.length === 0 ? (
          <p className="text-gray-400 text-sm">未記録</p>
        ) : (
          <>
            <div className="space-y-3">
              {todayMeals.map((m) => {
                const cal  = m.entries.reduce((s, e) => s + e.calories, 0)
                const prot = m.entries.reduce((s, e) => s + e.protein, 0)
                const fat  = m.entries.reduce((s, e) => s + e.fat, 0)
                const carb = m.entries.reduce((s, e) => s + e.carbs, 0)
                const salt = m.entries.reduce((s, e) => s + (e.sodium ?? 0), 0) * 2.54 / 1000
                const label = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' }[m.mealType]
                return (
                  <div key={m.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold text-gray-700">{label}</span>
                      <span className="text-sm font-bold text-green-600">{cal} kcal</span>
                    </div>
                    {/* 食品一覧 */}
                    <ul className="text-xs text-gray-500 mb-2 space-y-0.5">
                      {m.entries.map((e, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{e.foodName}（{e.grams}g）</span>
                          <span>{e.calories}kcal</span>
                        </li>
                      ))}
                    </ul>
                    {/* PFC + 塩分 */}
                    <div className="flex gap-3 text-xs text-gray-500 pt-1.5 border-t border-gray-50">
                      <span>P <b className="text-blue-500">{prot.toFixed(1)}g</b></span>
                      <span>F <b className="text-yellow-500">{fat.toFixed(1)}g</b></span>
                      <span>C <b className="text-orange-500">{carb.toFixed(1)}g</b></span>
                      <span>塩分 <b className="text-red-400">{salt.toFixed(1)}g</b></span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 1日合計PFC */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1.5">本日合計</p>
              <div className="flex gap-4 text-sm">
                <span>P <b className="text-blue-500">{totalProtein.toFixed(1)}g</b></span>
                <span>F <b className="text-yellow-500">{totalFat.toFixed(1)}g</b></span>
                <span>C <b className="text-orange-500">{totalCarbs.toFixed(1)}g</b></span>
                <span>塩分 <b className="text-red-400">{totalSaltG.toFixed(1)}g</b></span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* AIアドバイス */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 flex items-center gap-1.5">
            <Sparkles size={14} className="text-purple-400" /> アドバイス
          </h2>
          {hasApiKey && (
            <button
              onClick={handleAdvice}
              disabled={adviceLoading}
              className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 disabled:opacity-40 transition"
            >
              <RefreshCw size={12} className={adviceLoading ? 'animate-spin' : ''} />
              {adviceLoading ? '生成中...' : '今すぐ取得'}
            </button>
          )}
        </div>

        {!hasApiKey && (
          <p className="text-xs text-gray-400">設定ページでAPIキーを設定するとアドバイスが表示されます</p>
        )}

        {hasApiKey && !dailyAdvice && !weeklyAdvice && !adviceLoading && (
          <p className="text-xs text-gray-400">「今すぐ取得」を押すとAIがアドバイスします</p>
        )}

        {adviceLoading && (
          <p className="text-sm text-gray-400 animate-pulse">アドバイスを生成中...</p>
        )}

        {adviceError && (
          <p className="text-xs text-red-500 break-all">✗ {adviceError}</p>
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

    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

function StatText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}
