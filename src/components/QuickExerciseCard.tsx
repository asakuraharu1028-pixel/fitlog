import { useState } from 'react'
import { useAppStore } from '../lib/store'
import { localDateStr } from '../lib/utils'
import { QUICK_EXERCISES, buildQuickExerciseUpdate, hasExerciseOn, type QuickExercise } from '../lib/quickexercise'
import { Zap } from 'lucide-react'

/** 「ちょっとだけ運動」をワンタップで記録するカード */
export default function QuickExerciseCard({ date = localDateStr() }: { date?: string }) {
  const { data, saveData } = useAppStore()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const doneToday = hasExerciseOn(data, date)
  const isToday = date === localDateStr()

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

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <Zap size={16} className="text-amber-500" />
        <h2 className="font-semibold text-gray-700">ちょっとだけ運動</h2>
      </div>
      <p className={`text-xs mb-3 ${doneToday ? 'text-green-600' : 'text-gray-400'}`}>
        {doneToday
          ? `${isToday ? '今日' : 'この日'}は運動済み！もう1つやってもOK`
          : '1つだけでOK。終わったらタップして記録'}
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
