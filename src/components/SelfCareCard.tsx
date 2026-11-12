import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../lib/store'
import { localDateStr } from '../lib/utils'
import { buildCareToggle, careLogOn, computeCareStats, resolveCareItems } from '../lib/selfcare'
import type { CareItem, CareLog } from '../types'
import { Sparkles } from 'lucide-react'

/** 歯磨き・入浴・スキンケアなどをワンタップで記録するカード */
export default function SelfCareCard() {
  const { data, saveData } = useAppStore()
  const [busy, setBusy] = useState(false)
  const today = localDateStr()
  const items = resolveCareItems(data)
  const growing = items.filter(i => i.status === 'growing')
  const established = items.filter(i => i.status === 'established')

  const toggle = async (itemId: string, level: CareLog['level']) => {
    if (busy) return
    setBusy(true)
    try {
      // 連打されても前回の保存結果から作るよう、最新のデータを使う
      await saveData(buildCareToggle(useAppStore.getState().data, itemId, level, today))
    } finally {
      setBusy(false)
    }
  }

  const start = (itemId: string) => {
    const next = items.map(i => (i.id === itemId ? { ...i, status: 'growing' as const } : i))
    saveData({ settings: { ...data.settings, careItems: next } })
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={16} className="text-sky-500" />
          <h2 className="font-semibold text-gray-700">セルフケア</h2>
        </div>
        <Link to="/settings?s=habit" className="text-xs text-gray-400 underline">項目を編集</Link>
      </div>

      {growing.length === 0 && established.length === 0 ? (
        <Chooser items={items} onStart={start} />
      ) : (
        <div className="space-y-3">
          {growing.map(item => (
            <GrowingItem key={item.id} item={item} today={today} busy={busy} onToggle={toggle} />
          ))}

          {established.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 mb-1">定着済み（タップで記録）</p>
              <div className="flex flex-wrap gap-2">
                {established.map(item => {
                  const done = !!careLogOn(data, item.id, today)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id, careLogOn(data, item.id, today)?.level ?? 'full')}
                      disabled={busy}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-60
                        ${done ? 'bg-sky-500 text-white' : 'bg-sky-50 text-gray-600 hover:bg-sky-100'}`}
                    >
                      {done ? '✓' : item.icon} {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** まだ何も始めていないとき：1つだけ選んでもらう */
function Chooser({ items, onStart }: { items: CareItem[]; onStart: (id: string) => void }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">
        まずは<b>1つだけ</b>選んで始めましょう。慣れてきたら次を足します。
      </p>
      <div className="space-y-2">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onStart(item.id)}
            className="w-full flex items-center gap-3 rounded-xl bg-sky-50 hover:bg-sky-100 px-3 py-2.5 text-left transition"
          >
            <span className="text-xl">{item.icon}</span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-700">{item.label}</span>
              {item.minimum && <span className="block text-[11px] text-gray-400">最低ライン：{item.minimum}</span>}
            </span>
            <span className="text-xs text-sky-600 font-semibold">始める</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function GrowingItem({
  item, today, busy, onToggle,
}: {
  item: CareItem
  today: string
  busy: boolean
  onToggle: (id: string, level: CareLog['level']) => void
}) {
  const data = useAppStore(s => s.data)
  const log = careLogOn(data, item.id, today)
  const stats = computeCareStats(data, item.id, today)
  const weekday = (date: string) =>
    new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', { weekday: 'short' })
  // 3週間以上、8割できていれば「定着してきた」とみなす
  const settled = stats.days28 >= 21 && stats.rate28 >= 0.8

  return (
    <div className="rounded-xl border border-sky-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-700">{item.icon} {item.label}</p>
          {item.anchor && <p className="text-[11px] text-gray-400">{item.anchor}、やる</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-sky-600">7日中 {stats.last7}日</p>
          {stats.days28 > 0 && (
            <p className="text-[10px] text-gray-400">
              {stats.days28 >= 28 ? '4週間' : `${stats.days28}日間`}で {Math.round(stats.rate28 * 100)}%
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <LevelButton
          label="最低ライン" detail={item.minimum} active={log?.level === 'min'} busy={busy}
          onClick={() => onToggle(item.id, 'min')}
        />
        <LevelButton
          label="ちゃんと" detail={item.full} active={log?.level === 'full'} busy={busy}
          onClick={() => onToggle(item.id, 'full')}
        />
      </div>

      <div className="flex justify-between mt-2 px-1">
        {stats.recent.map(({ date, level }) => (
          <div key={date} className="flex flex-col items-center gap-0.5">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px]
              ${level === 'full' ? 'bg-sky-500 text-white'
                : level === 'min' ? 'bg-sky-200 text-sky-700'
                : date === today ? 'border-2 border-dashed border-sky-300'
                : 'bg-gray-100'}`}>
              {level ? '✓' : ''}
            </span>
            <span className={`text-[9px] ${date === today ? 'text-sky-600 font-bold' : 'text-gray-400'}`}>
              {date === today ? '今日' : weekday(date)}
            </span>
          </div>
        ))}
      </div>

      <p className={`text-xs mt-2 ${log ? 'text-green-600' : 'text-gray-500'}`}>
        {log
          ? (log.level === 'min' ? '今日もできた！最低ラインでも立派に1回です' : '今日もできた！')
          : stats.recent.slice(0, 6).some(r => !r.level) && stats.last7 > 0
            ? '抜けた日があっても大丈夫。今日やれば続いています'
            : `${item.minimum || '少しだけ'}でOK。終わったらタップ`}
      </p>
      {settled && (
        <p className="text-xs text-sky-600 mt-1">
          🌱 定着してきました。設定で「定着済み」にして、次の項目を始めてもOKです
        </p>
      )}
    </div>
  )
}

function LevelButton({
  label, detail, active, busy, onClick,
}: { label: string; detail: string; active: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-xl px-3 py-2 text-left transition disabled:opacity-60
        ${active ? 'bg-sky-500 text-white' : 'bg-sky-50 text-gray-700 hover:bg-sky-100'}`}
    >
      <span className="block text-sm font-medium">{active ? '✓ ' : ''}{label}</span>
      {detail && <span className={`block text-[10px] ${active ? 'text-sky-100' : 'text-gray-400'}`}>{detail}</span>}
    </button>
  )
}
