import { useState } from 'react'
import { useAppStore } from '../lib/store'
import { localDateStr } from '../lib/utils'
import { computeExerciseStreak } from '../lib/streak'
import { QUICK_EXERCISES, buildQuickExerciseUpdate, hasExerciseOn, type QuickExercise } from '../lib/quickexercise'
import { Zap } from 'lucide-react'

/** 「ちょっとだけ運動」をワンタップで記録するカード */
export default function QuickExerciseCard({ date = localDateStr() }: { date?: string }) {
  const { data, saveData } = useAppStore()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const doneToday = hasExerciseOn(data, date)
  const isToday = date === localDateStr()
  // 運動の連続記録は、表示中の日付ではなく実際の今日を基準にする
  const streak = computeExerciseStreak(data)

  const handleTap = async (q: QuickExercise) => {
    if (savingId) return
    setSavingId(q.id)
    try {
      // 連打されても前回の保存結果に積み上がるよう、最新のデータから作る
      await saveData(buildQuickExerciseUpdate(q, useAppStore.getState().data, date))
      setSavedId(q.id)
      setTimeout(() => setSavedId(prev => (prev === q.id ? null : prev)), 2000)
    } finally {
      setSavingId(null)
    }
  }

  let message: string
  if (doneToday) {
    message = `${isToday ? '今日' : 'この日'}は運動済み！もう1つやってもOK`
  } else if (isToday && streak.current > 0) {
    message = `1つやると運動 ${streak.current + 1}日連続 に伸びます`
  } else {
    message = '1つだけでOK。終わったらタップして記録'
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Zap size={16} className="text-amber-500" />
          <h2 className="font-semibold text-gray-700">ちょっとだけ運動</h2>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-orange-500">💪 {streak.current}日連続</p>
          <p className="text-[10px] text-gray-400">最長 {streak.best}日・🧊残り{streak.freezesLeftThisWeek}回/週</p>
        </div>
      </div>
      <p className={`text-xs mb-3 ${doneToday ? 'text-green-600' : 'text-orange-500 font-semibold'}`}>
        {message}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_EXERCISES.map(q => (
          <button
            key={q.id}
            onClick={() => handleTap(q)}
            disabled={!!savingId}
            className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-left transition disabled:opacity-60
              ${savedId === q.id ? 'bg-green-500 text-white' : 'bg-amber-50 text-gray-700 hover:bg-amber-100'}`}
          >
            <span className="text-lg">{savedId === q.id ? '✓' : q.icon}</span>
            <span>{savingId === q.id ? '記録中...' : q.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
