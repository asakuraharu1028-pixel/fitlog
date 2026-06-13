import { useState } from 'react'
import { useAppStore } from '../lib/store'
import { localDateStr } from '../lib/utils'
import DateSelector from '../components/DateSelector'
import type { BodyRecord, PeriodLog } from '../types'
import { nanoid } from 'nanoid'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

function calcBMI(weight: number, heightCm: number) {
  const h = heightCm / 100
  return Math.round((weight / (h * h)) * 10) / 10
}

type ChartPeriod = '2w' | '1m' | '3m' | 'all'

/** 平均生理周期（直近5件から計算、データ不足時はデフォルト28日） */
function calcAvgCycle(logs: PeriodLog[]): number {
  const sorted = [...logs].sort((a, b) => a.startDate.localeCompare(b.startDate))
  if (sorted.length < 2) return 28
  const diffs: number[] = []
  for (let i = 1; i < Math.min(sorted.length, 6); i++) {
    const prev = new Date(sorted[i - 1].startDate)
    const curr = new Date(sorted[i].startDate)
    diffs.push(Math.round((curr.getTime() - prev.getTime()) / 86400000))
  }
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
}

export default function Body() {
  const { data, saveData } = useAppStore()
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [period, setPeriod] = useState<ChartPeriod>('1m')
  const [graphType, setGraphType] = useState<'weight' | 'fat' | 'bmi'>('weight')

  // 生理記録
  const [periodStart, setPeriodStart] = useState(localDateStr())
  const [periodEnd, setPeriodEnd] = useState('')
  const [periodNotes, setPeriodNotes] = useState('')
  const [periodSaving, setPeriodSaving] = useState(false)
  const [periodSaved, setPeriodSaved] = useState(false)
  const [showPeriodForm, setShowPeriodForm] = useState(false)

  const today = localDateStr()
  const [selectedDate, setSelectedDate] = useState(today)
  const existing = data.bodyRecords.find((r) => r.date === selectedDate)

  const handleSave = async () => {
    const w = parseFloat(weight)
    if (isNaN(w)) return
    setSaving(true)
    try {
      const bf = parseFloat(bodyFat)
      const record: BodyRecord = {
        id: existing?.id ?? nanoid(),
        date: selectedDate,
        weight: w,
        bodyFatPct: isNaN(bf) ? undefined : bf,
        bmi: calcBMI(w, data.settings.heightCm),
      }
      const updated = data.bodyRecords.filter((r) => r.date !== selectedDate)
      updated.push(record)
      await saveData({ bodyRecords: updated })
      setSaved(true)
      setWeight('')
      setBodyFat('')
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  // グラフ用データ生成
  const sorted = [...data.bodyRecords].sort((a, b) => a.date.localeCompare(b.date))

  const periodDays: Record<ChartPeriod, number> = { '2w': 14, '1m': 30, '3m': 90, 'all': 9999 }
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - periodDays[period])
  const cutoffStr = localDateStr(cutoff)

  const chartData = sorted
    .filter((r) => r.date >= cutoffStr)
    .map((r) => ({
      date: r.date.slice(5), // MM-DD
      体重: r.weight,
      体脂肪率: r.bodyFatPct ?? null,
      BMI: r.bmi ?? null,
      目標体重: data.settings.goalWeightKg ?? null,
    }))

  // 最新記録
  const latest = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  const diff = latest && prev ? Math.round((latest.weight - prev.weight) * 100) / 100 : null

  const recent = [...sorted].reverse().slice(0, 30)

  // 生理記録
  const periodLogs = (data.periodLogs ?? []).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const latestPeriod = periodLogs[0]
  const avgCycle = calcAvgCycle(periodLogs)
  const nextPeriodDate = latestPeriod
    ? (() => {
        const d = new Date(latestPeriod.startDate)
        d.setDate(d.getDate() + avgCycle)
        return localDateStr(d)
      })()
    : null

  const handlePeriodSave = async () => {
    if (!periodStart) return
    setPeriodSaving(true)
    try {
      const newLog: PeriodLog = {
        id: nanoid(),
        startDate: periodStart,
        endDate: periodEnd || undefined,
        notes: periodNotes || undefined,
      }
      await saveData({ periodLogs: [newLog, ...(data.periodLogs ?? [])] })
      setPeriodSaved(true)
      setPeriodStart(localDateStr())
      setPeriodEnd('')
      setPeriodNotes('')
      setShowPeriodForm(false)
      setTimeout(() => setPeriodSaved(false), 2000)
    } finally {
      setPeriodSaving(false)
    }
  }

  const handlePeriodDelete = async (id: string) => {
    await saveData({ periodLogs: (data.periodLogs ?? []).filter(p => p.id !== id) })
  }

  return (
    <div className="p-4 space-y-4">

      {/* 日付セレクター */}
      <DateSelector date={selectedDate} onChange={(d) => { setSelectedDate(d); setWeight(''); setBodyFat('') }} />

      {/* 入力 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">
          {selectedDate === today ? '今日' : selectedDate}の記録
        </h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-500">体重 (kg)</span>
            <input
              type="number" step="0.1" value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={existing ? String(existing.weight) : '例: 65.0'}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-500">体脂肪率 (%)</span>
            <input
              type="number" step="0.1" value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              placeholder={existing?.bodyFatPct != null ? String(existing.bodyFatPct) : '任意'}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>
          {weight && !isNaN(parseFloat(weight)) && (
            <p className="text-sm text-gray-500">
              BMI: <span className="font-semibold text-gray-700">
                {calcBMI(parseFloat(weight), data.settings.heightCm)}
              </span>
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !weight}
            className="w-full bg-green-500 text-white rounded-xl py-3 font-semibold disabled:opacity-40 hover:bg-green-600 active:bg-green-700 transition"
          >
            {saving ? '保存中...' : saved ? '✓ 保存しました' : '保存'}
          </button>
        </div>
      </div>

      {/* 最新サマリー */}
      {latest && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-3">最新の記録</h2>
          <div className="flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-gray-800">{latest.weight.toFixed(2)}<span className="text-sm font-normal text-gray-400"> kg</span></p>
              <p className="text-xs text-gray-400">体重</p>
              {diff !== null && (
                <p className={`text-xs mt-0.5 ${diff < 0 ? 'text-green-500' : diff > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {diff > 0 ? `+${diff.toFixed(2)}` : diff?.toFixed(2)} kg
                </p>
              )}
            </div>
            {latest.bodyFatPct != null && (
              <div>
                <p className="text-2xl font-bold text-blue-500">{latest.bodyFatPct}<span className="text-sm font-normal text-gray-400"> %</span></p>
                <p className="text-xs text-gray-400">体脂肪率</p>
              </div>
            )}
            {latest.bmi != null && (
              <div>
                <p className="text-2xl font-bold text-purple-500">{latest.bmi}</p>
                <p className="text-xs text-gray-400">BMI</p>
              </div>
            )}
            {data.settings.goalWeightKg && (
              <div>
                <p className="text-2xl font-bold text-orange-400">
                  {(Math.round((latest.weight - data.settings.goalWeightKg!) * 100) / 100).toFixed(2)}
                  <span className="text-sm font-normal text-gray-400"> kg</span>
                </p>
                <p className="text-xs text-gray-400">目標まで</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* グラフ */}
      {chartData.length >= 2 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">推移グラフ</h2>
            {/* 表示指標切替 */}
            <div className="flex gap-1 text-xs">
              {(['weight', 'fat', 'bmi'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setGraphType(t)}
                  className={`px-2 py-1 rounded-lg transition ${graphType === t ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}
                >
                  {{ weight: '体重', fat: '体脂肪', bmi: 'BMI' }[t]}
                </button>
              ))}
            </div>
          </div>

          {/* 期間切替 */}
          <div className="flex gap-1 text-xs mb-3">
            {(['2w', '1m', '3m', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-lg transition ${period === p ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                {{ '2w': '2週間', '1m': '1ヶ月', '3m': '3ヶ月', 'all': '全期間' }[p]}
              </button>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [
                  graphType === 'weight' ? `${v} kg`
                  : graphType === 'fat' ? `${v} %`
                  : String(v),
                  ''
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />

              {graphType === 'weight' && (
                <>
                  <Line type="monotone" dataKey="体重" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  {data.settings.goalWeightKg && (
                    <Line type="monotone" dataKey="目標体重" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  )}
                </>
              )}
              {graphType === 'fat' && (
                <Line type="monotone" dataKey="体脂肪率" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              )}
              {graphType === 'bmi' && (
                <Line type="monotone" dataKey="BMI" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 過去の記録一覧 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">過去の記録</h2>
        {recent.length === 0 ? (
          <p className="text-gray-400 text-sm">記録がありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b">
                <th className="pb-2 text-left">日付</th>
                <th className="pb-2 text-right">体重</th>
                <th className="pb-2 text-right">体脂肪率</th>
                <th className="pb-2 text-right">BMI</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-600">{r.date}</td>
                  <td className="py-2 text-right font-medium">{r.weight.toFixed(2)}</td>
                  <td className="py-2 text-right text-gray-500">{r.bodyFatPct ?? '—'}</td>
                  <td className="py-2 text-right text-gray-500">{r.bmi ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 生理記録 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">生理記録</h2>
          <button
            onClick={() => setShowPeriodForm(!showPeriodForm)}
            className="text-sm text-pink-500 font-medium"
          >
            {showPeriodForm ? 'キャンセル' : '+ 記録する'}
          </button>
        </div>

        {/* 次回予測 */}
        {nextPeriodDate && (
          <div className="bg-pink-50 rounded-xl px-3 py-2.5 mb-3 flex justify-between items-center">
            <div>
              <p className="text-xs text-pink-600 font-semibold">次回予測</p>
              <p className="text-sm font-bold text-pink-700">{nextPeriodDate}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-pink-400">平均周期</p>
              <p className="text-sm font-semibold text-pink-600">{avgCycle} 日</p>
            </div>
          </div>
        )}

        {/* 記録フォーム */}
        {showPeriodForm && (
          <div className="space-y-3 mb-4 border border-pink-100 rounded-xl p-3">
            <label className="block">
              <span className="text-sm text-gray-500">開始日 <span className="text-red-400">*</span></span>
              <input
                type="date" value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-500">終了日（任意）</span>
              <input
                type="date" value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-500">メモ（任意）</span>
              <input
                type="text" value={periodNotes}
                onChange={(e) => setPeriodNotes(e.target.value)}
                placeholder="症状など"
                className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </label>
            <button
              onClick={handlePeriodSave}
              disabled={periodSaving || !periodStart}
              className="w-full bg-pink-500 text-white rounded-xl py-2.5 font-semibold disabled:opacity-40 hover:bg-pink-600 transition"
            >
              {periodSaving ? '保存中...' : periodSaved ? '✓ 保存しました' : '保存'}
            </button>
          </div>
        )}

        {/* 記録一覧 */}
        {periodLogs.length === 0 ? (
          <p className="text-gray-400 text-sm">記録がありません</p>
        ) : (
          <ul className="space-y-2">
            {periodLogs.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-start justify-between text-sm border-b border-gray-50 pb-2">
                <div>
                  <span className="font-medium text-gray-700">{p.startDate}</span>
                  {p.endDate && <span className="text-gray-400 ml-1">〜 {p.endDate}</span>}
                  {p.endDate && (
                    <span className="text-xs text-pink-400 ml-1">
                      ({Math.round((new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / 86400000) + 1} 日間)
                    </span>
                  )}
                  {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                </div>
                <button
                  onClick={() => handlePeriodDelete(p.id)}
                  className="text-gray-300 hover:text-red-400 text-xs ml-2 shrink-0"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
