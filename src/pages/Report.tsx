import { useState } from 'react'
import { useAppStore } from '../lib/store'
import { localDateStr } from '../lib/utils'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Download } from 'lucide-react'
import { downloadCSV, type CsvKind } from '../lib/csvExport'

type Period = 'week' | 'month'

function getDateRange(period: Period) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (period === 'week' ? 6 : 29))
  const dates: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(localDateStr(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function shortDate(date: string, period: Period) {
  const d = new Date(date)
  return period === 'week'
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : d.getDate() % 5 === 1 ? `${d.getMonth() + 1}/${d.getDate()}` : ''
}

export default function Report() {
  const { data } = useAppStore()
  const [period, setPeriod] = useState<Period>('week')

  const dates = getDateRange(period)

  // 体重グラフデータ
  const bodyChartData = dates.map((date) => {
    const rec = data.bodyRecords.find((r) => r.date === date)
    return {
      date: shortDate(date, period),
      fullDate: date,
      体重: rec?.weight ?? null,
      体脂肪率: rec?.bodyFatPct ?? null,
      BMI: rec?.bmi ?? null,
    }
  })

  // 栄養サマリーデータ
  const nutritionChartData = dates.map((date) => {
    const logs = data.mealLogs.filter((m) => m.date === date)
    const calories = logs.reduce((s, m) => s + m.entries.reduce((a, e) => a + e.calories, 0), 0)
    const protein  = logs.reduce((s, m) => s + m.entries.reduce((a, e) => a + e.protein, 0), 0)
    const fat      = logs.reduce((s, m) => s + m.entries.reduce((a, e) => a + e.fat, 0), 0)
    const carbs    = logs.reduce((s, m) => s + m.entries.reduce((a, e) => a + e.carbs, 0), 0)
    return {
      date: shortDate(date, period),
      カロリー: calories || null,
      タンパク質: Math.round(protein * 10) / 10 || null,
      脂質: Math.round(fat * 10) / 10 || null,
      炭水化物: Math.round(carbs * 10) / 10 || null,
    }
  })

  // 睡眠グラフデータ（分 → 時間）
  const sleepChartData = dates.map((date) => {
    const logs = (data.sleepLogs ?? []).filter((s) => s.date === date)
    const totalMin = logs.reduce((s, r) => s + r.durationMin, 0)
    return {
      date: shortDate(date, period),
      睡眠時間: totalMin > 0 ? Math.round(totalMin / 6) / 10 : null,
    }
  })

  const weightKg = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? 60

  // 運動サマリーデータ
  const exerciseChartData = dates.map((date) => {
    const cardio   = data.cardioLogs.filter((c) => c.date === date)
    const strength = data.strengthLogs.filter((s) => s.date === date)
    const stepLog  = (data.stepLogs ?? []).find((l) => l.date === date)
    const cardioKcal   = cardio.reduce((s, c) => s + c.caloriesBurned, 0)
    const strengthKcal = strength.reduce((s, t) => s + (t.estimatedCalories ?? 0), 0)
    const stepsKcal    = stepLog ? Math.round(stepLog.steps * weightKg * 0.0005) : 0
    return {
      date: shortDate(date, period),
      有酸素: cardioKcal || null,
      筋トレ: strengthKcal || null,
      歩数: stepsKcal || null,
    }
  })

  // 期間サマリー集計
  const recordedDays = dates.filter((d) => data.bodyRecords.find((r) => r.date === d)).length
  const avgCalories = (() => {
    const days = nutritionChartData.filter((d) => d.カロリー)
    return days.length ? Math.round(days.reduce((s, d) => s + (d.カロリー ?? 0), 0) / days.length) : 0
  })()
  const totalExercise = exerciseChartData.reduce(
    (s, d) => s + (d.有酸素 ?? 0) + (d.筋トレ ?? 0) + (d.歩数 ?? 0), 0
  )
  const latestBody = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]
  const oldestInRange = data.bodyRecords
    .filter((r) => r.date >= dates[0])
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const weightChange = latestBody && oldestInRange && latestBody.date !== oldestInRange.date
    ? Math.round((latestBody.weight - oldestInRange.weight) * 10) / 10
    : null

  return (
    <div className="p-4 space-y-4">

      {/* 期間切替 */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        {(['week', 'month'] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${period === p ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>
            {p === 'week' ? '直近1週間' : '直近1ヶ月'}
          </button>
        ))}
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-1">体重記録日数</p>
          <p className="text-2xl font-bold text-green-500">{recordedDays}<span className="text-sm font-normal text-gray-400"> 日</span></p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-1">体重変化</p>
          <p className={`text-2xl font-bold ${weightChange === null ? 'text-gray-300' : weightChange < 0 ? 'text-green-500' : weightChange > 0 ? 'text-red-400' : 'text-gray-500'}`}>
            {weightChange === null ? '—' : `${weightChange > 0 ? '+' : ''}${weightChange}`}
            {weightChange !== null && <span className="text-sm font-normal text-gray-400"> kg</span>}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-1">平均摂取カロリー</p>
          <p className="text-2xl font-bold text-blue-500">{avgCalories || '—'}<span className="text-sm font-normal text-gray-400">{avgCalories ? ' kcal' : ''}</span></p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
          <p className="text-xs text-gray-400 mb-1">合計消費カロリー</p>
          <p className="text-2xl font-bold text-orange-500">{totalExercise || '—'}<span className="text-sm font-normal text-gray-400">{totalExercise ? ' kcal' : ''}</span></p>
        </div>
      </div>

      {/* 体重グラフ */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">体重・体脂肪推移</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={bodyChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="体重" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="体脂肪率" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 栄養グラフ */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">カロリー摂取推移</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={nutritionChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            {data.settings.goalCalories && (
              <Line type="monotone" dataKey={() => data.settings.goalCalories} stroke="#f97316" strokeDasharray="4 4" dot={false} name="目標" />
            )}
            <Bar dataKey="カロリー" fill="#86efac" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {/* PFC週計 */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(['タンパク質', '脂質', '炭水化物'] as const).map((key) => {
            const total = Math.round(nutritionChartData.reduce((s, d) => s + (d[key] ?? 0), 0) * 10) / 10
            const color = { タンパク質: 'text-blue-500', 脂質: 'text-yellow-500', 炭水化物: 'text-orange-500' }[key]
            return (
              <div key={key} className="bg-gray-50 rounded-xl py-2">
                <p className={`font-bold ${color}`}>{total}g</p>
                <p className="text-xs text-gray-400">{period === 'week' ? '週' : '月'}計 {key}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 運動グラフ */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">運動消費カロリー</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={exerciseChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="有酸素" stackId="a" fill="#fdba74" radius={[0, 0, 0, 0]} />
            <Bar dataKey="筋トレ" stackId="a" fill="#c084fc" radius={[0, 0, 0, 0]} />
            <Bar dataKey="歩数" stackId="a" fill="#5eead4" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 睡眠グラフ */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">睡眠時間推移</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={sleepChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit="h" domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [`${v}時間`, '睡眠時間']}
            />
            <Bar dataKey="睡眠時間" fill="#818cf8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {(() => {
          const recorded = sleepChartData.filter(d => d.睡眠時間)
          const avg = recorded.length
            ? Math.round(recorded.reduce((s, d) => s + (d.睡眠時間 ?? 0), 0) / recorded.length * 10) / 10
            : null
          return avg !== null ? (
            <p className="text-xs text-gray-400 text-center mt-2">
              平均睡眠時間: <span className="text-indigo-500 font-semibold">{avg}時間</span>（{recorded.length}日間記録）
            </p>
          ) : (
            <p className="text-xs text-gray-400 text-center mt-2">睡眠記録がありません</p>
          )
        })()}
      </div>

      {/* CSVエクスポート */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">データエクスポート</h2>
        <div className="space-y-2">
          {[
            { label: '体重・体組成・睡眠データ', kind: 'body',     color: 'bg-green-500 hover:bg-green-600' },
            { label: '食事記録データ',     kind: 'meal',     color: 'bg-blue-500 hover:bg-blue-600' },
            { label: '運動記録データ',     kind: 'exercise', color: 'bg-orange-500 hover:bg-orange-600' },
            { label: '習慣記録データ',     kind: 'habit',    color: 'bg-amber-500 hover:bg-amber-600' },
          ].map(({ label, kind, color }) => (
            <button key={label} onClick={() => downloadCSV(kind as CsvKind, data)}
              className={`w-full ${color} text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2 transition`}>
              <Download size={16} />
              {label}（CSV）
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">全期間のデータをCSV形式でダウンロードします（毎月1回、Googleドライブの FitLog_CSV フォルダにも自動で書き出します）</p>
      </div>
    </div>
  )
}
