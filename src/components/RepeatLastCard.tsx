import { useState } from 'react'
import { useAppStore } from '../lib/store'
import { STRENGTH_DB } from '../lib/exercisedb'
import { buildRepeatUpdate, lastExerciseSession } from '../lib/quickexercise'
import type { CardioLog, StrengthLog } from '../types'
import { RotateCcw } from 'lucide-react'

function strengthSummary(s: StrengthLog): string {
  const isSeconds = STRENGTH_DB.find(e => e.name === s.name)?.unit === 'seconds'
  const unit = isSeconds ? '秒' : '回'
  const first = s.sets[0]
  // 全セット同じ内容なら「40kg×10回×3」とまとめる
  if (first && s.sets.every(set => set.weight === first.weight && set.reps === first.reps)) {
    const weight = first.weight > 0 ? `${first.weight}kg×` : ''
    return `${weight}${first.reps}${unit}×${s.sets.length}セット`
  }
  return `${s.sets.length}セット`
}

function formatDate(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
}

/** 前回運動した日の内容を、ワンタップでもう一度記録するカード */
export default function RepeatLastCard({ date }: { date: string }) {
  const { data, saveData } = useAppStore()
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())
  const session = lastExerciseSession(data, date)
  if (!session) return null

  const items = [
    ...session.cardio.map(c => ({ key: c.id, label: c.name, detail: `${c.durationMin}分`, cardio: [c], strength: [] as StrengthLog[] })),
    ...session.strength.map(s => ({ key: s.id, label: s.name, detail: strengthSummary(s), cardio: [] as CardioLog[], strength: [s] })),
  ]

  const repeat = async (key: string, logs: { cardio: CardioLog[]; strength: StrengthLog[] }, keys: string[]) => {
    if (savingKey) return
    setSavingKey(key)
    try {
      await saveData(buildRepeatUpdate(logs, useAppStore.getState().data, date))
      setSavedKeys(prev => new Set([...prev, ...keys]))
    } finally {
      setSavingKey(null)
    }
  }

  const allSaved = items.every(i => savedKeys.has(i.key))

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <RotateCcw size={15} className="text-sky-500" />
          <h2 className="font-semibold text-gray-700">前回と同じ</h2>
          <span className="text-xs text-gray-400">{formatDate(session.date)}</span>
        </div>
        {items.length > 1 && (
          <button
            onClick={() => repeat('all', session, items.map(i => i.key))}
            disabled={!!savingKey || allSaved}
            className="text-xs font-medium text-white bg-sky-500 rounded-lg px-3 py-1 disabled:opacity-50 hover:bg-sky-600 transition"
          >
            {savingKey === 'all' ? '記録中...' : allSaved ? '✓ 記録済み' : 'まとめて記録'}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.map(item => {
          const saved = savedKeys.has(item.key)
          return (
            <div key={item.key} className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{item.label}</p>
                <p className="text-xs text-gray-400">{item.detail}</p>
              </div>
              <button
                onClick={() => repeat(item.key, item, [item.key])}
                disabled={!!savingKey || saved}
                className={`shrink-0 text-xs font-medium rounded-lg px-3 py-1 transition disabled:opacity-60
                  ${saved ? 'bg-green-500 text-white' : 'bg-sky-50 text-sky-600 hover:bg-sky-100'}`}
              >
                {savingKey === item.key ? '記録中...' : saved ? '✓' : 'もう一度'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
