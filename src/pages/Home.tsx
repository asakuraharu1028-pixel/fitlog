import { useAppStore } from '../lib/store'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function Home() {
  const { data } = useAppStore()
  const today = todayStr()

  const todayBody = data.bodyRecords.find((r) => r.date === today)
  const todayMeals = data.mealLogs.filter((m) => m.date === today)
  const todayCardio = data.cardioLogs.filter((c) => c.date === today)
  const todayStrength = data.strengthLogs.filter((s) => s.date === today)

  const totalCaloriesIn = todayMeals.reduce(
    (sum, m) => sum + m.entries.reduce((s, e) => s + e.calories, 0),
    0
  )
  const totalCaloriesOut =
    todayCardio.reduce((sum, c) => sum + c.caloriesBurned, 0) +
    todayStrength.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0)

  const goal = data.settings.goalCalories ?? 2000
  const remaining = goal - totalCaloriesIn + totalCaloriesOut

  return (
    <div className="p-4 space-y-4">
      <div className="text-center py-2">
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('ja-JP', {
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
          })}
        </p>
      </div>

      {/* カロリーサマリー */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">今日のカロリー</h2>
        <div className="flex justify-around text-center">
          <div>
            <p className="text-2xl font-bold text-blue-500">{goal}</p>
            <p className="text-xs text-gray-400">目標</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-500">{totalCaloriesIn}</p>
            <p className="text-xs text-gray-400">摂取</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-orange-500">{totalCaloriesOut}</p>
            <p className="text-xs text-gray-400">消費</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${remaining >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
              {remaining}
            </p>
            <p className="text-xs text-gray-400">残り</p>
          </div>
        </div>
      </div>

      {/* 体重 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">今日の体重</h2>
        {todayBody ? (
          <div className="flex gap-4">
            <Stat label="体重" value={`${todayBody.weight.toFixed(2)} kg`} />
            {todayBody.bodyFatPct != null && (
              <Stat label="体脂肪率" value={`${todayBody.bodyFatPct} %`} />
            )}
            {todayBody.bmi != null && (
              <Stat label="BMI" value={String(todayBody.bmi)} />
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">未記録</p>
        )}
      </div>

      {/* 今日の食事 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">今日の食事</h2>
        {todayMeals.length === 0 ? (
          <p className="text-gray-400 text-sm">未記録</p>
        ) : (
          <ul className="space-y-1">
            {todayMeals.map((m) => {
              const cal = m.entries.reduce((s, e) => s + e.calories, 0)
              const label = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' }[m.mealType]
              return (
                <li key={m.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-medium">{cal} kcal</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}
