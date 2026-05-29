import { useState } from 'react'
import { useAppStore } from '../lib/store'
import {
  CARDIO_DB, STRENGTH_DB,
  calcCardioCalories, calcStrengthCalories, calcVolume,
} from '../lib/exercisedb'
import type { CardioLog, StrengthLog } from '../types'
import { nanoid } from 'nanoid'
import { Plus, Trash2, ChevronDown, ChevronUp, Flame, Dumbbell } from 'lucide-react'

type Tab = 'cardio' | 'strength'
const CATEGORIES = ['全身', '胸', '背中', '肩', '腕', '脚', '体幹'] as const

export default function Exercise() {
  const { data, saveData } = useAppStore()
  const today = new Date().toISOString().slice(0, 10)
  const bodyWeight = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? 60

  const [tab, setTab] = useState<Tab>('cardio')

  // 有酸素
  const [cardioId, setCardioId] = useState(CARDIO_DB[1].id)
  const [durationMin, setDurationMin] = useState('30')
  const [cardioSaving, setCardioSaving] = useState(false)
  const [cardioSaved, setCardioSaved] = useState(false)

  // 筋トレ
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('全身')
  const [strengthId, setStrengthId] = useState(STRENGTH_DB[0].id)
  const [sets, setSets] = useState([{ weight: 0, reps: 10 }])

  const selectedStrength = STRENGTH_DB.find((s) => s.id === strengthId) ?? STRENGTH_DB[0]
  const isSeconds = selectedStrength.unit === 'seconds'
  const [strengthSaving, setStrengthSaving] = useState(false)
  const [strengthSaved, setStrengthSaved] = useState(false)

  // 展開
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const todayCardio   = data.cardioLogs.filter((c) => c.date === today)
  const todayStrength = data.strengthLogs.filter((s) => s.date === today)

  const totalBurned =
    todayCardio.reduce((s, c) => s + c.caloriesBurned, 0) +
    todayStrength.reduce((s, t) => s + (t.estimatedCalories ?? 0), 0)

  // 有酸素保存
  const handleCardioSave = async () => {
    const exercise = CARDIO_DB.find((c) => c.id === cardioId)!
    const dur = parseInt(durationMin)
    if (!dur || dur <= 0) return
    setCardioSaving(true)
    try {
      const log: CardioLog = {
        id: nanoid(),
        date: today,
        name: exercise.name,
        durationMin: dur,
        met: exercise.met,
        caloriesBurned: calcCardioCalories(exercise.met, bodyWeight, dur),
      }
      await saveData({ cardioLogs: [...data.cardioLogs, log] })
      setCardioSaved(true)
      setDurationMin('30')
      setTimeout(() => setCardioSaved(false), 2000)
    } finally {
      setCardioSaving(false)
    }
  }

  // 筋トレ保存
  const handleStrengthSave = async () => {
    const exercise = STRENGTH_DB.find((s) => s.id === strengthId)!
    setStrengthSaving(true)
    try {
      const log: StrengthLog = {
        id: nanoid(),
        date: today,
        name: exercise.name,
        sets,
        estimatedCalories: calcStrengthCalories(exercise.metPerMin, bodyWeight, sets, isSeconds),
      }
      await saveData({ strengthLogs: [...data.strengthLogs, log] })
      setStrengthSaved(true)
      setSets([{ weight: 0, reps: 10 }])
      setTimeout(() => setStrengthSaved(false), 2000)
    } finally {
      setStrengthSaving(false)
    }
  }

  // 削除
  const deleteCardio = async (id: string) => {
    await saveData({ cardioLogs: data.cardioLogs.filter((c) => c.id !== id) })
  }
  const deleteStrength = async (id: string) => {
    await saveData({ strengthLogs: data.strengthLogs.filter((s) => s.id !== id) })
  }

  // 選択中の有酸素プレビュー
  const selectedCardio = CARDIO_DB.find((c) => c.id === cardioId)!
  const previewCalories = calcCardioCalories(selectedCardio.met, bodyWeight, parseInt(durationMin) || 0)

  // 筋トレフィルター
  const filteredStrength = STRENGTH_DB.filter(
    (s) => category === '全身' || s.category === category
  )

  return (
    <div className="p-4 space-y-4">

      {/* 今日のサマリー */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">今日の運動</h2>
        <div className="flex justify-around text-center">
          <div>
            <p className="text-2xl font-bold text-orange-500">{totalBurned}</p>
            <p className="text-xs text-gray-400">消費 kcal</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-500">{todayCardio.length}</p>
            <p className="text-xs text-gray-400">有酸素</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-500">{todayStrength.length}</p>
            <p className="text-xs text-gray-400">筋トレ種目</p>
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        <button onClick={() => setTab('cardio')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${tab === 'cardio' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-500'}`}>
          <Flame size={16} /> 有酸素
        </button>
        <button onClick={() => setTab('strength')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${tab === 'strength' ? 'bg-white text-purple-500 shadow-sm' : 'text-gray-500'}`}>
          <Dumbbell size={16} /> 筋トレ
        </button>
      </div>

      {tab === 'cardio' ? (
        <>
          {/* 有酸素入力 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-gray-700">有酸素運動を追加</h2>

            <label className="block">
              <span className="text-sm text-gray-500">種目</span>
              <select value={cardioId} onChange={(e) => setCardioId(e.target.value)}
                className="mt-1 block w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400">
                {CARDIO_DB.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}（MET: {c.met}）</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-gray-500">時間（分）</span>
              <input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)}
                className="mt-1 block w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </label>

            {/* プレビュー */}
            <div className="bg-orange-50 rounded-xl px-4 py-3 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                <p>{selectedCardio.name}</p>
                <p className="text-xs text-gray-400">{durationMin}分 × 体重{bodyWeight}kg</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-orange-500">{previewCalories}</p>
                <p className="text-xs text-gray-400">消費 kcal</p>
              </div>
            </div>

            <button onClick={handleCardioSave} disabled={cardioSaving || !durationMin}
              className="w-full bg-orange-500 text-white rounded-xl py-3 font-semibold disabled:opacity-40 hover:bg-orange-600 transition flex items-center justify-center gap-2">
              <Plus size={16} />
              {cardioSaving ? '保存中...' : cardioSaved ? '✓ 追加しました' : '記録する'}
            </button>
          </div>

          {/* 今日の有酸素履歴 */}
          {todayCardio.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h2 className="font-semibold text-gray-700 mb-3">今日の有酸素</h2>
              <div className="space-y-2">
                {todayCardio.map((c) => (
                  <div key={c.id} className="flex justify-between items-center border border-gray-100 rounded-xl px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.durationMin}分</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-orange-500">{c.caloriesBurned} kcal</span>
                      <button onClick={() => deleteCardio(c.id)} className="text-gray-300 hover:text-red-400 transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* 筋トレ入力 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-gray-700">筋トレを追加</h2>

            {/* カテゴリ */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => { setCategory(cat); setStrengthId(STRENGTH_DB.find(s => cat === '全身' || s.category === cat)?.id ?? STRENGTH_DB[0].id) }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${category === cat ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {cat}
                </button>
              ))}
            </div>

            {/* 種目 */}
            <label className="block">
              <span className="text-sm text-gray-500">種目</span>
              <select value={strengthId} onChange={(e) => {
                  const next = STRENGTH_DB.find(s => s.id === e.target.value)
                  setStrengthId(e.target.value)
                  setSets([{ weight: 0, reps: next?.unit === 'seconds' ? 30 : 10 }])
                }}
                className="mt-1 block w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-400">
                {filteredStrength.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.unit === 'seconds' ? '（秒）' : ''}
                  </option>
                ))}
              </select>
            </label>

            {/* セット入力 */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">
                  セット {isSeconds && <span className="text-xs text-purple-500">（秒数で入力）</span>}
                </span>
                <button onClick={() => setSets([...sets, { weight: sets[sets.length - 1]?.weight ?? 0, reps: sets[sets.length - 1]?.reps ?? (isSeconds ? 30 : 10) }])}
                  className="text-xs text-purple-500 font-medium flex items-center gap-1">
                  <Plus size={12} /> セット追加
                </button>
              </div>
              <div className="space-y-2">
                {sets.map((set, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-8 text-center">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <input type="number" value={set.weight} min={0} step={2.5}
                          onChange={(e) => { const s = [...sets]; s[i] = { ...s[i], weight: parseFloat(e.target.value) || 0 }; setSets(s) }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400" />
                        <span className="text-xs text-gray-400">kg</span>
                        <span className="text-gray-300">×</span>
                        <input type="number" value={set.reps} min={1}
                          onChange={(e) => { const s = [...sets]; s[i] = { ...s[i], reps: parseInt(e.target.value) || 1 }; setSets(s) }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400" />
                        <span className="text-xs text-gray-400">{isSeconds ? '秒' : '回'}</span>
                      </div>
                    </div>
                    {sets.length > 1 && (
                      <button onClick={() => setSets(sets.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ボリューム・消費カロリー プレビュー */}
            <div className="bg-purple-50 rounded-xl px-4 py-3 grid grid-cols-3 text-center text-sm">
              <div>
                <p className="font-bold text-purple-600">{sets.length}</p>
                <p className="text-xs text-gray-400">セット</p>
              </div>
              <div>
                <p className="font-bold text-purple-600">
                  {isSeconds
                    ? sets.reduce((s, v) => s + v.reps, 0) + '秒'
                    : calcVolume(sets).toLocaleString() + 'kg'}
                </p>
                <p className="text-xs text-gray-400">{isSeconds ? '合計秒数' : '総ボリューム'}</p>
              </div>
              <div>
                <p className="font-bold text-orange-500">
                  {calcStrengthCalories(selectedStrength.metPerMin, bodyWeight, sets, isSeconds)}
                </p>
                <p className="text-xs text-gray-400">消費 kcal</p>
              </div>
            </div>

            <button onClick={handleStrengthSave} disabled={strengthSaving}
              className="w-full bg-purple-500 text-white rounded-xl py-3 font-semibold disabled:opacity-40 hover:bg-purple-600 transition flex items-center justify-center gap-2">
              <Plus size={16} />
              {strengthSaving ? '保存中...' : strengthSaved ? '✓ 追加しました' : '記録する'}
            </button>
          </div>

          {/* 今日の筋トレ履歴 */}
          {todayStrength.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h2 className="font-semibold text-gray-700 mb-3">今日の筋トレ</h2>
              <div className="space-y-2">
                {todayStrength.map((s) => {
                  const isOpen = expandedId === s.id
                  const volume = calcVolume(s.sets)
                  return (
                    <div key={s.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button className="w-full flex justify-between items-center px-3 py-2.5 hover:bg-gray-50"
                        onClick={() => setExpandedId(isOpen ? null : s.id)}>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-700">{s.name}</p>
                          <p className="text-xs text-gray-400">
                            {s.sets.length}セット｜
                            {STRENGTH_DB.find(e => e.name === s.name)?.unit === 'seconds'
                              ? s.sets.reduce((a, v) => a + v.reps, 0) + '秒'
                              : volume.toLocaleString() + 'kg vol'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-orange-500">{s.estimatedCalories ?? 0} kcal</span>
                          {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-gray-100 px-3 pb-2">
                          <table className="w-full text-sm mt-2">
                            <thead>
                              <tr className="text-gray-400 text-xs">
                                <th className="text-left pb-1">セット</th>
                                <th className="text-right pb-1">重量</th>
                                <th className="text-right pb-1">回数/秒数</th>
                                <th className="text-right pb-1">ボリューム</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.sets.map((set, i) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="py-1 text-gray-500">{i + 1}</td>
                                  <td className="py-1 text-right font-medium">{set.weight} kg</td>
                                  <td className="py-1 text-right">{set.reps} 回</td>
                                  <td className="py-1 text-right text-purple-500">{set.weight * set.reps} kg</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button onClick={() => deleteStrength(s.id)}
                            className="mt-2 text-xs text-red-400 hover:text-red-500 flex items-center gap-1">
                            <Trash2 size={12} /> 削除
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
