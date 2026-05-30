import { useState } from 'react'
import { useAppStore } from '../lib/store'
import type { BodyRecord } from '../types'
import { nanoid } from 'nanoid'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

function calcBMI(weight: number, heightCm: number) {
  const h = heightCm / 100
  return Math.round((weight / (h * h)) * 10) / 10
}

type Period = '2w' | '1m' | '3m' | 'all'

export default function Body() {
  const { data, saveData } = useAppStore()
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [period, setPeriod] = useState<Period>('1m')
  const [graphType, setGraphType] = useState<'weight' | 'fat' | 'bmi'>('weight')

  const today = new Date().toISOString().slice(0, 10)
  const existing = data.bodyRecords.find((r) => r.date === today)

  const handleSave = async () => {
    const w = parseFloat(weight)
    if (isNaN(w)) return
    setSaving(true)
    try {
      const bf = parseFloat(bodyFat)
      const record: BodyRecord = {
        id: existing?.id ?? nanoid(),
        date: today,
        weight: w,
        bodyFatPct: isNaN(bf) ? undefined : bf,
        bmi: calcBMI(w, data.settings.heightCm),
      }
      const updated = data.bodyRecords.filter((r) => r.date !== today)
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

  const periodDays: Record<Period, number> = { '2w': 14, '1m': 30, '3m': 90, 'all': 9999 }
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - periodDays[period])
  const cutoffStr = cutoff.toISOString().slice(0, 10)

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

  return (
    <div className="p-4 space-y-4">

      {/* 今日の入力 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">今日の記録</h2>
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
    </div>
  )
}
