import { useState } from 'react'
import { useAppStore } from '../lib/store'
import { isNative } from '../lib/auth'
import { CARE_ICONS, DEFAULT_CARE_ITEMS, newCareItem, resolveCareItems } from '../lib/selfcare'
import { resolveReminderSettings } from '../lib/reminders'
import type { CareItem, CareStatus } from '../types'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

const STATUS_OPTIONS: { value: CareStatus; label: string }[] = [
  { value: 'growing', label: '育成中' },
  { value: 'established', label: '定着済み' },
  { value: 'paused', label: 'お休み' },
]

/** 設定画面：セルフケア項目の編集 */
export default function SelfCareSettingsCard() {
  const { data, saveData } = useAppStore()
  const items = resolveCareItems(data)
  const [openId, setOpenId] = useState<string | null>(null)
  const growingCount = items.filter(i => i.status === 'growing').length
  const remindersOn = resolveReminderSettings(data.settings.reminders).enabled

  // 入力途中の値が古いデータで上書きされないよう、保存時点の最新データから作る
  const commit = (fn: (items: CareItem[]) => CareItem[]) => {
    const latest = useAppStore.getState().data
    return saveData({ settings: { ...latest.settings, careItems: fn(resolveCareItems(latest)) } })
  }
  const updateItem = (id: string, patch: Partial<CareItem>) =>
    commit(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)))

  const addItem = () => {
    const item = newCareItem()
    commit(list => [...list, item])
    setOpenId(item.id)
  }

  const removeItem = (item: CareItem) => {
    if (!confirm(`「${item.label}」を削除しますか？（これまでの記録は残ります）`)) return
    commit(list => list.filter(i => i.id !== item.id))
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h2 className="font-semibold text-gray-700 mb-1">セルフケア</h2>
      <p className="text-xs text-gray-400 mb-3">
        「育成中」はホームで大きく表示します。一度に育てるのは1〜2個がおすすめ。
        自然にできるようになったら「定着済み」にして、次の項目を始めましょう。
      </p>
      {growingCount >= 3 && (
        <p className="text-xs text-orange-500 mb-2">
          育成中が{growingCount}個あります。多いと全部やめたくなりやすいので、減らすのもアリです。
        </p>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="rounded-xl border border-gray-100">
            <button
              onClick={() => setOpenId(openId === item.id ? null : item.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1 text-sm text-gray-700">{item.label}</span>
              <span className={`text-[10px] rounded-full px-2 py-0.5
                ${item.status === 'growing' ? 'bg-sky-100 text-sky-700'
                  : item.status === 'established' ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'}`}>
                {STATUS_OPTIONS.find(o => o.value === item.status)?.label}
              </span>
              {openId === item.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {openId === item.id && (
              <ItemEditor
                item={item}
                remindersOn={remindersOn}
                deletable={!DEFAULT_CARE_ITEMS.some(d => d.id === item.id)}
                onChange={patch => updateItem(item.id, patch)}
                onDelete={() => removeItem(item)}
              />
            )}
          </div>
        ))}
      </div>

      <button onClick={addItem} className="mt-3 flex items-center gap-1 text-xs text-sky-600">
        <Plus size={14} /> 項目を追加
      </button>
    </div>
  )
}

function ItemEditor({
  item, remindersOn, deletable, onChange, onDelete,
}: {
  item: CareItem
  remindersOn: boolean
  deletable: boolean
  onChange: (patch: Partial<CareItem>) => void
  onDelete: () => void
}) {
  // 文字入力は1文字ごとに Drive 保存しないよう、フォーカスが外れたときに保存する
  const [text, setText] = useState({
    label: item.label, anchor: item.anchor, minimum: item.minimum, full: item.full,
  })
  const commitText = (key: keyof typeof text) => {
    const value = text[key].trim()
    if (key === 'label' && !value) { setText(t => ({ ...t, label: item.label })); return }
    if (value !== item[key]) onChange({ [key]: value })
  }

  const field = (key: keyof typeof text, label: string, placeholder: string) => (
    <label className="block">
      <span className="text-[11px] text-gray-500">{label}</span>
      <input
        value={text[key]}
        placeholder={placeholder}
        onChange={e => setText(t => ({ ...t, [key]: e.target.value }))}
        onBlur={() => commitText(key)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
      />
    </label>
  )

  return (
    <div className="px-3 pb-3 space-y-2">
      <div className="flex gap-1">
        {STATUS_OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => onChange({ status: o.value })}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition
              ${item.status === o.value ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-500'}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {CARE_ICONS.map(icon => (
          <button
            key={icon}
            onClick={() => onChange({ icon })}
            className={`w-8 h-8 rounded-lg text-lg ${item.icon === icon ? 'bg-sky-100 ring-2 ring-sky-400' : 'bg-gray-50'}`}
          >
            {icon}
          </button>
        ))}
      </div>

      {field('label', '名前', '例: 夜の歯磨き')}
      {field('anchor', 'きっかけ（すでに毎日やっていること）', '例: 寝る前にスマホを充電器につないだら')}
      {field('minimum', '最低ライン（これだけでも「できた」）', '例: 1本だけ磨く')}
      {field('full', 'ちゃんとやる版', '例: 全部の歯を2分')}

      {isNative && (
        <div className={`flex items-center gap-3 ${remindersOn ? '' : 'opacity-50'}`}>
          <label className="flex items-center gap-2 flex-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={!!item.reminderEnabled}
              onChange={e => onChange({ reminderEnabled: e.target.checked })}
              className="w-4 h-4 accent-sky-500"
            />
            通知する
          </label>
          <input
            type="time"
            value={item.reminderTime ?? '21:00'}
            disabled={!item.reminderEnabled}
            onChange={e => e.target.value && onChange({ reminderTime: e.target.value })}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:text-gray-300"
          />
        </div>
      )}
      {isNative && !remindersOn && (
        <p className="text-[11px] text-gray-400">通知を使うには「記録リマインド通知」をオンにしてください</p>
      )}
      <p className="text-[11px] text-gray-400">
        通知は「育成中」「定着済み」の項目だけ、その日まだ記録していないときに届きます。
      </p>

      {deletable && (
        <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-400">
          <Trash2 size={12} /> この項目を削除
        </button>
      )}
    </div>
  )
}
