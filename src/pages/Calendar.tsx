import { useState } from 'react'
import { ChevronLeft, ChevronRight, Moon, Sparkles } from 'lucide-react'
import { useAppStore } from '../lib/store'
import type { MealLog } from '../types'

const MEAL_LABELS: Record<string, string> = {
  breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食',
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay() // 0=Sun
}

interface DayDots {
  meal: boolean
  exercise: boolean
  body: boolean
  sleep: boolean
  advice: boolean
}

export default function Calendar() {
  const { data } = useAppStore()
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelected(null)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelected(null)
  }

  const days   = getDaysInMonth(year, month)
  const offset = getFirstDayOfWeek(year, month)

  // 記録済み日付セット
  const mealDates     = new Set(data.mealLogs.map(m => m.date))
  const bodyDates     = new Set(data.bodyRecords.map(r => r.date))
  const exerciseDates = new Set([
    ...data.cardioLogs.map(c => c.date),
    ...data.strengthLogs.map(s => s.date),
    ...(data.stepLogs ?? []).map(l => l.date),
  ])
  const sleepDates  = new Set((data.sleepLogs ?? []).map(s => s.date))
  const adviceDates = new Set((data.adviceLogs ?? []).map(a => a.date))

  const dotsFor = (dateStr: string): DayDots => ({
    meal:     mealDates.has(dateStr),
    exercise: exerciseDates.has(dateStr),
    body:     bodyDates.has(dateStr),
    sleep:    sleepDates.has(dateStr),
    advice:   adviceDates.has(dateStr),
  })

  const todayStr = toYMD(now.getFullYear(), now.getMonth(), now.getDate())

  // 選択日の詳細
  const selMeals    = selected ? data.mealLogs.filter(m => m.date === selected)
    .sort((a, b) => ['breakfast','lunch','dinner','snack'].indexOf(a.mealType) - ['breakfast','lunch','dinner','snack'].indexOf(b.mealType)) : []
  const selBody     = selected ? data.bodyRecords.find(r => r.date === selected) : null
  const selCardio   = selected ? data.cardioLogs.filter(c => c.date === selected) : []
  const selStrength = selected ? data.strengthLogs.filter(s => s.date === selected) : []
  const selSteps    = selected ? (data.stepLogs ?? []).find(l => l.date === selected) : null
  const selSleep    = selected ? (data.sleepLogs ?? []).filter(s => s.date === selected) : []
  const selAdvice   = selected ? (data.adviceLogs ?? []).find(a => a.date === selected) : null

  const totalCal = selMeals.reduce((s, m: MealLog) => s + m.entries.reduce((ss, e) => ss + e.calories, 0), 0)
  const totalSleepMin = selSleep.reduce((s, r) => s + r.durationMin, 0)

  return (
    <div className="p-4 space-y-4">

      {/* 月ナビゲーション */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1 text-gray-400 hover:text-gray-600">
            <ChevronLeft size={20} />
          </button>
          <h2 className="font-bold text-gray-700">
            {year}年{month + 1}月
          </h2>
          <button onClick={nextMonth} className="p-1 text-gray-400 hover:text-gray-600">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-1">
          {['日','月','火','水','木','金','土'].map((d, i) => (
            <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const day     = i + 1
            const dateStr = toYMD(year, month, day)
            const dots    = dotsFor(dateStr)
            const isToday = dateStr === todayStr
            const isSel   = dateStr === selected
            const dow     = (offset + i) % 7

            return (
              <button
                key={day}
                onClick={() => setSelected(isSel ? null : dateStr)}
                className={`flex flex-col items-center py-1 rounded-xl transition
                  ${isSel ? 'bg-green-500' : isToday ? 'bg-green-50' : 'hover:bg-gray-50'}`}
              >
                <span className={`text-sm font-medium
                  ${isSel ? 'text-white' : isToday ? 'text-green-600' : dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-700'}`}>
                  {day}
                </span>
                <div className="flex gap-0.5 mt-0.5 h-2 items-center">
                  {dots.meal     && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-green-400'}`} />}
                  {dots.exercise && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-orange-400'}`} />}
                  {dots.body     && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-blue-400'}`} />}
                  {dots.sleep    && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-indigo-400'}`} />}
                  {dots.advice   && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-purple-400'}`} />}
                </div>
              </button>
            )
          })}
        </div>

        {/* 凡例 */}
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100 justify-center">
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />食事
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />運動
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />体重
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />睡眠
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />AI
          </span>
        </div>
      </div>

      {/* 選択日の詳細 */}
      {selected && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-700">
            {new Date(selected + 'T00:00:00').toLocaleDateString('ja-JP', {
              year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
            })}
          </h3>

          {/* 体重 */}
          {selBody ? (
            <div className="flex gap-4 text-sm">
              <span className="text-gray-500">体重</span>
              <span className="font-semibold text-blue-500">{selBody.weight.toFixed(2)} kg</span>
              {selBody.bodyFatPct != null && (
                <span className="text-gray-500">体脂肪率 <b className="text-blue-400">{selBody.bodyFatPct}%</b></span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">体重：未記録</p>
          )}

          {/* 食事 */}
          {selMeals.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">
                食事 — 合計 <span className="text-green-600">{totalCal} kcal</span>
              </p>
              <div className="space-y-2">
                {selMeals.map(m => {
                  const cal = m.entries.reduce((s, e) => s + e.calories, 0)
                  return (
                    <div key={m.id} className="border border-gray-100 rounded-xl p-2.5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-700">{MEAL_LABELS[m.mealType]}</span>
                        <span className="text-sm font-bold text-green-600">{cal} kcal</span>
                      </div>
                      <ul className="text-xs text-gray-400 space-y-0.5">
                        {m.entries.map((e, i) => (
                          <li key={i} className="flex justify-between">
                            <span>{e.foodName}（{e.grams}g）</span>
                            <span>{e.calories}kcal</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">食事：未記録</p>
          )}

          {/* 睡眠 */}
          {totalSleepMin > 0 ? (
            <div className="flex items-center gap-2 text-sm">
              <Moon size={14} className="text-indigo-400 shrink-0" />
              <span className="text-gray-500">睡眠</span>
              <span className="font-semibold text-indigo-500">
                {Math.floor(totalSleepMin / 60)}時間{totalSleepMin % 60}分
              </span>
            </div>
          ) : (
            <p className="text-xs text-gray-400">睡眠：未記録</p>
          )}

          {/* 運動 */}
          {(selCardio.length > 0 || selStrength.length > 0 || selSteps) ? (() => {
            const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? 60
            const stepsKcal = selSteps ? Math.round(selSteps.steps * weightKg * 0.0005) : 0
            const cardioKcal = selCardio.reduce((s, c) => s + c.caloriesBurned, 0)
            const strengthKcal = selStrength.reduce((s, t) => s + (t.estimatedCalories ?? 0), 0)
            const totalExKcal = cardioKcal + strengthKcal + stepsKcal
            return (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">運動</p>
                <div className="space-y-1">
                  {selSteps && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">歩数</span>
                      <span className="text-xs text-orange-500">{selSteps.steps.toLocaleString()} 歩 / {stepsKcal}kcal</span>
                    </div>
                  )}
                  {selCardio.map(c => (
                    <div key={c.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{c.name}</span>
                      <span className="text-xs text-orange-500">{c.durationMin}分 / {c.caloriesBurned}kcal</span>
                    </div>
                  ))}
                  {selStrength.map(s => (
                    <div key={s.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{s.name}</span>
                      <span className="text-xs text-orange-500">{s.sets.length}セット{s.estimatedCalories != null ? ` / ${s.estimatedCalories}kcal` : ''}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-gray-100 flex justify-end mt-1">
                  <span className="text-xs text-gray-500">合計消費 </span>
                  <span className="text-sm font-bold text-orange-500 ml-1">{totalExKcal} kcal</span>
                </div>
              </div>
            )
          })() : (
            <p className="text-xs text-gray-400">運動：未記録</p>
          )}

          {/* AIアドバイス */}
          {selAdvice && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                <Sparkles size={12} className="text-purple-400" /> AIアドバイス
              </p>
              {selAdvice.daily && (
                <div>
                  <p className="text-xs font-semibold text-purple-600 mb-0.5">📅 今日の総括</p>
                  <p className="text-xs text-gray-600 whitespace-pre-line">{selAdvice.daily}</p>
                </div>
              )}
              {selAdvice.weekly && (
                <div>
                  <p className="text-xs font-semibold text-indigo-600 mb-0.5">📊 今週の総括</p>
                  <p className="text-xs text-gray-600 whitespace-pre-line">{selAdvice.weekly}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
