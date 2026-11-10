import { Link } from 'react-router-dom'
import { useAppStore } from '../lib/store'
import { localDateStr } from '../lib/utils'
import { computeRewardProgress, formatDays } from '../lib/rewards'
import { claimReward } from '../lib/rewardActions'
import { STREAK_CATEGORIES, STREAK_CATEGORY_META } from '../lib/streak'
import { Gift } from 'lucide-react'

/** ホーム：4項目の累計平均でもらえるご褒美の進み具合 */
export default function RewardCard() {
  const data = useAppStore(s => s.data)
  const settings = data.settings.rewards
  const today = localDateStr()

  if (!settings) {
    return (
      <Link to="/settings" className="block bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Gift size={16} className="text-amber-500" />
          <span className="text-sm text-gray-600">ご褒美を設定すると、記録を続けた節目でもらえます</span>
        </div>
      </Link>
    )
  }

  const progress = computeRewardProgress(data, settings, today)
  const { average, next } = progress
  // 次の節目までの進み具合（1つ前の節目〜次の節目の間で何％か）
  const prevDays = [...progress.milestones].reverse().find(m => m.reached)?.days ?? 0
  const ratio = next ? Math.min(1, (average - prevDays) / Math.max(1, next.days - prevDays)) : 1

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gift size={16} className="text-amber-500" />
          <h2 className="font-semibold text-gray-700">ご褒美</h2>
        </div>
        <Link to="/settings" className="text-xs text-gray-400 underline">節目を編集</Link>
      </div>

      {/* 到達したのにまだ受け取っていないご褒美 */}
      {progress.unclaimed.map(m => (
        <div key={m.id} className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm font-bold text-amber-700">🎉 平均{m.days}日 達成！</p>
          <p className="text-sm text-gray-700 mt-0.5">ご褒美：{m.label || '（未設定）'}</p>
          <button
            onClick={() => claimReward(m.id)}
            className="mt-2 w-full rounded-lg bg-amber-500 text-white py-1.5 text-sm font-semibold"
          >
            受け取った！
          </button>
        </div>
      ))}

      <div className="flex items-end gap-1 mt-3">
        <span className="text-xs text-gray-500 mb-1">4項目の平均</span>
        <span className="text-2xl font-bold text-amber-500">{formatDays(average)}</span>
        <span className="text-xs text-gray-500 mb-1">日</span>
        <span className="ml-auto text-[10px] text-gray-400 mb-1">
          {new Date(settings.startDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}から
        </span>
      </div>

      {next ? (
        <>
          <div className="h-2 rounded-full bg-amber-100 mt-1 overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="text-xs text-gray-600 mt-1.5">
            あと<b className="text-amber-600">{formatDays(next.days - average)}日</b>で
            「{next.label || `平均${next.days}日のご褒美`}」
          </p>
        </>
      ) : progress.milestones.length > 0 ? (
        <p className="text-xs text-gray-500 mt-1">登録した節目はすべて達成！設定で次の節目を足しましょう</p>
      ) : (
        <p className="text-xs text-gray-500 mt-1">設定画面で「平均◯日 → ご褒美」を登録してください</p>
      )}

      <div className="flex justify-between mt-2 text-[11px] text-gray-500">
        {STREAK_CATEGORIES.map(c => (
          <span key={c}>{STREAK_CATEGORY_META[c].icon} {progress.perCategory[c]}日</span>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        今日は {progress.todayCount}/4 項目（+{formatDays(progress.todayCount / 4)}日）
      </p>
    </div>
  )
}
