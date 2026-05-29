import { useState, useEffect } from 'react'
import { useAppStore } from '../lib/store'

export default function Settings() {
  const { data, saveData } = useAppStore()
  const [height, setHeight] = useState(String(data.settings.heightCm))
  const [goalWeight, setGoalWeight] = useState(String(data.settings.goalWeightKg ?? ''))
  const [goalCalories, setGoalCalories] = useState(String(data.settings.goalCalories ?? ''))
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setHeight(String(data.settings.heightCm))
    setGoalWeight(String(data.settings.goalWeightKg ?? ''))
    setGoalCalories(String(data.settings.goalCalories ?? ''))
  }, [data.settings])

  const handleSave = async () => {
    const h = parseFloat(height)
    if (isNaN(h) || h <= 0) return
    setSaving(true)
    await saveData({
      settings: {
        ...data.settings,
        heightCm: h,
        goalWeightKg: goalWeight ? parseFloat(goalWeight) : undefined,
        goalCalories: goalCalories ? parseInt(goalCalories) : undefined,
      },
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">基本情報</h2>
        <div className="space-y-4">

          {/* 身長 */}
          <label className="block">
            <span className="text-sm font-medium text-gray-600">身長 (cm) <span className="text-red-400">*</span></span>
            <input
              type="number"
              step="0.1"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="例: 170.0"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>

          {/* 目標体重 */}
          <label className="block">
            <span className="text-sm font-medium text-gray-600">目標体重 (kg)</span>
            <input
              type="number"
              step="0.1"
              value={goalWeight}
              onChange={(e) => setGoalWeight(e.target.value)}
              placeholder="例: 60.0"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>

          {/* 目標カロリー */}
          <label className="block">
            <span className="text-sm font-medium text-gray-600">1日の目標カロリー (kcal)</span>
            <input
              type="number"
              step="50"
              value={goalCalories}
              onChange={(e) => setGoalCalories(e.target.value)}
              placeholder="例: 1800"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <p className="text-xs text-gray-400 mt-1">未設定の場合は 2000 kcal で計算されます</p>
          </label>

        </div>
      </div>

      {/* BMI目安 */}
      {height && !isNaN(parseFloat(height)) && (
        <div className="bg-green-50 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-green-700 mb-2">BMI目安（身長 {height} cm）</h3>
          <table className="w-full text-xs text-gray-600">
            <tbody>
              {[
                { label: '低体重', range: '18.5未満', bmi: 18.4 },
                { label: '普通体重', range: '18.5〜24.9', bmi: 21.7 },
                { label: '肥満(1度)', range: '25〜29.9', bmi: 27.5 },
                { label: '肥満(2度以上)', range: '30以上', bmi: 30 },
              ].map(({ label, range, bmi }) => {
                const h = parseFloat(height) / 100
                const kg = Math.round(bmi * h * h * 10) / 10
                return (
                  <tr key={label} className="border-b border-green-100">
                    <td className="py-1 font-medium">{label}</td>
                    <td className="py-1 text-center">BMI {range}</td>
                    <td className="py-1 text-right text-green-600">{kg} kg</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !height}
        className="w-full bg-green-500 text-white rounded-xl py-3 font-semibold disabled:opacity-40 hover:bg-green-600 active:bg-green-700 transition"
      >
        {saving ? '保存中...' : saved ? '✓ 保存しました' : '保存'}
      </button>
    </div>
  )
}
