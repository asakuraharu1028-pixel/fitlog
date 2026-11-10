import { useState } from 'react'
import { useAppStore } from '../lib/store'
import { localDateStr } from '../lib/utils'
import {
  computeRewardProgress, formatDays, MILESTONE_PRESETS, newMilestone, patchMilestone, sortMilestones,
} from '../lib/rewards'
import { updateRewards } from '../lib/rewardActions'
import type { RewardMilestone } from '../types'
import { Gift, Plus, Trash2 } from 'lucide-react'

/** 設定画面：ご褒美の節目（平均◯日 → ご褒美）の登録 */
export default function RewardSettingsCard() {
  const data = useAppStore(s => s.data)
  const settings = data.settings.rewards

  const updateMilestone = (id: string, patch: Partial<Omit<RewardMilestone, 'id' | 'updatedAt'>>) =>
    updateRewards(s => patchMilestone(s, id, patch))

  const addMilestone = () => {
    const used = new Set((settings?.milestones ?? []).map(m => m.days))
    const max = Math.max(0, ...used)
    const days = MILESTONE_PRESETS.find(d => !used.has(d) && d > max) ?? max + 30
    updateRewards(s => ({ ...s, milestones: [...s.milestones, newMilestone(days)] }))
  }

  const removeMilestone = (m: RewardMilestone) => {
    if (!confirm(`平均${m.days}日の節目を削除しますか？`)) return
    updateRewards(s => ({ ...s, milestones: s.milestones.filter(x => x.id !== m.id) }))
  }

  if (!settings) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <Header />
        <button
          onClick={() => updateRewards(() => ({
            startDate: localDateStr(),
            updatedAt: new Date().toISOString(),
            milestones: [7, 30, 100].map(newMilestone),
          }))}
          className="mt-2 w-full rounded-xl bg-amber-500 text-white py-2 text-sm font-semibold"
        >
          今日からご褒美制度を始める
        </button>
      </div>
    )
  }

  const progress = computeRewardProgress(data, settings)

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <Header />

      {/* 保存した日付が変わったら入力欄も作り直す */}
      <StartDateField key={settings.startDate} saved={settings.startDate} />
      <p className="text-xs text-gray-500 mt-1">今の平均：<b className="text-amber-600">{formatDays(progress.average)}日</b></p>

      <div className="space-y-2 mt-3">
        {sortMilestones(settings.milestones).map(m => (
          <MilestoneRow
            // 他の端末や Drive 再読み込みで節目が変わったら、入力欄を作り直して最新の値を出す
            key={`${m.id}:${m.updatedAt ?? ''}`}
            milestone={m}
            reached={progress.average >= m.days}
            onChange={patch => updateMilestone(m.id, patch)}
            onDelete={() => removeMilestone(m)}
          />
        ))}
        {settings.milestones.length === 0 && (
          <p className="text-xs text-gray-400">節目がありません。下の「節目を追加」から登録してください。</p>
        )}
      </div>

      <button onClick={addMilestone} className="mt-3 flex items-center gap-1 text-xs text-amber-600">
        <Plus size={14} /> 節目を追加
      </button>
    </div>
  )
}

/**
 * 数え始める日。入力途中（年を打っている途中など）の日付で保存しないよう、
 * 入力欄は下書きにして「この日から数え直す」で確定する。
 */
function StartDateField({ saved }: { saved: string }) {
  const [draft, setDraft] = useState(saved)
  const today = localDateStr()
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft) && draft >= '2000-01-01' && draft <= today

  const apply = () => {
    if (!valid || draft === saved) return
    if (!confirm('数え始める日を変えると、累計の日数が数え直しになります。変更しますか？')) return
    updateRewards(s => ({ ...s, startDate: draft, updatedAt: new Date().toISOString() }))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-600">
      <span>数え始めた日</span>
      <input
        type="date"
        value={draft}
        min="2000-01-01"
        max={today}
        onChange={e => setDraft(e.target.value)}
        className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
      />
      {draft !== saved && (
        <>
          <button
            onClick={apply}
            disabled={!valid}
            className="rounded-lg bg-amber-500 text-white px-2 py-1 text-xs font-semibold disabled:opacity-40"
          >
            この日から数え直す
          </button>
          <button onClick={() => setDraft(saved)} className="text-xs text-gray-400 underline">戻す</button>
        </>
      )}
    </div>
  )
}

function Header() {
  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <Gift size={16} className="text-amber-500" />
        <h2 className="font-semibold text-gray-700">ご褒美</h2>
      </div>
      <p className="text-xs text-gray-400">
        運動・食事・体重睡眠・習慣の4項目の「記録した日数」の平均で判定します。
        1日で4項目そろえば+1日、2項目なら+0.5日。途切れても積み上げは減りません。
      </p>
    </>
  )
}

function MilestoneRow({
  milestone, reached, onChange, onDelete,
}: {
  milestone: RewardMilestone
  reached: boolean
  onChange: (patch: Partial<RewardMilestone>) => void
  onDelete: () => void
}) {
  // 文字入力は1文字ごとに Drive 保存しないよう、フォーカスが外れたときに保存する
  const [days, setDays] = useState(String(milestone.days))
  const [label, setLabel] = useState(milestone.label)

  const commitDays = () => {
    const n = Math.round(Number(days))
    if (!Number.isFinite(n) || n < 1) { setDays(String(milestone.days)); return }
    if (n !== milestone.days) onChange({ days: n })
  }
  const commitLabel = () => {
    const v = label.trim()
    if (v !== milestone.label) onChange({ label: v })
  }

  return (
    <div className={`rounded-xl border p-2 ${reached ? 'border-amber-200 bg-amber-50' : 'border-gray-100'}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">平均</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={days}
          onChange={e => setDays(e.target.value)}
          onBlur={commitDays}
          className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
        />
        <span className="text-xs text-gray-500 shrink-0">日 →</span>
        <input
          value={label}
          placeholder="例: ケーキを買う"
          onChange={e => setLabel(e.target.value)}
          onBlur={commitLabel}
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm"
        />
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 shrink-0" aria-label="削除">
          <Trash2 size={14} />
        </button>
      </div>
      {reached && (
        <div className="flex items-center justify-between mt-1 px-1">
          <span className="text-[11px] text-amber-600">
            {milestone.claimedAt
              ? `🎁 受け取り済み（${new Date(milestone.claimedAt).toLocaleDateString('ja-JP')}）`
              : '🎉 達成！ホームから受け取れます'}
          </span>
          {milestone.claimedAt && (
            <button onClick={() => onChange({ claimedAt: undefined })} className="text-[11px] text-gray-400 underline">
              未受け取りに戻す
            </button>
          )}
        </div>
      )}
    </div>
  )
}
