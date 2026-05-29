import { useState } from 'react'
import { useAppStore } from '../lib/store'
import type { BodyRecord } from '../types'
import { nanoid } from 'nanoid'

function calcBMI(weight: number, heightCm: number) {
  const h = heightCm / 100
  return Math.round((weight / (h * h)) * 10) / 10
}

export default function Body() {
  const { data, saveData } = useAppStore()
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const existing = data.bodyRecords.find((r) => r.date === today)

  const handleSave = async () => {
    const w = parseFloat(weight)
    if (isNaN(w)) return
    setSaving(true)
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
    setSaving(false)
  }

  const recent = [...data.bodyRecords]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">今日の記録</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-500">体重 (kg)</span>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={existing ? String(existing.weight) : '例: 65.0'}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-500">体脂肪率 (%)</span>
            <input
              type="number"
              step="0.1"
              value={bodyFat}
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
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

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
                  <td className="py-2 text-right font-medium">{r.weight}</td>
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
