import { useState } from 'react'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useAppStore } from '../lib/store'
import { isNative } from '../lib/auth'
import {
  REMINDER_KINDS, REMINDER_LABELS, resolveReminderSettings, requestReminderPermission, ensureReminderChannel,
  type ResolvedReminderSettings,
} from '../lib/reminders'
import type { ReminderKind } from '../types'

export default function ReminderSettingsCard() {
  const { data, saveData } = useAppStore()
  const settings = resolveReminderSettings(data.settings.reminders)
  const [message, setMessage] = useState<string | null>(null)

  const save = (next: ResolvedReminderSettings) =>
    saveData({ settings: { ...data.settings, reminders: next } })

  const toggleEnabled = async () => {
    setMessage(null)
    if (!settings.enabled) {
      const granted = await requestReminderPermission()
      if (!granted) {
        setMessage('通知が許可されていません。端末の設定でFitLogの通知を許可してください。')
        return
      }
    }
    await save({ ...settings, enabled: !settings.enabled })
  }

  const updateItem = (kind: ReminderKind, patch: Partial<{ enabled: boolean; time: string }>) =>
    save({ ...settings, items: { ...settings.items, [kind]: { ...settings.items[kind], ...patch } } })

  const sendTest = async () => {
    await ensureReminderChannel()
    await LocalNotifications.schedule({
      notifications: [{
        id: 9999,
        title: '🔔 テスト通知',
        body: 'FitLog の通知はこのように届きます',
        channelId: 'reminders',
        schedule: { at: new Date(Date.now() + 5000) },
      }],
    })
    setMessage('5秒後にテスト通知が届きます')
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-700">記録リマインド通知</h2>
        {isNative && (
          <button
            onClick={toggleEnabled}
            className={`relative w-11 h-6 rounded-full transition ${settings.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
            aria-label="通知のオン・オフ"
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
              ${settings.enabled ? 'left-5.5' : 'left-0.5'}`} />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        記録がまだのときだけ、選択中のアドバイザーが声をかけます。記録済みの項目は通知されません。
      </p>

      {!isNative ? (
        <p className="text-xs text-gray-500">通知は Android アプリでのみ利用できます</p>
      ) : (
        <>
          <div className={`space-y-2 ${settings.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            {REMINDER_KINDS.map(kind => {
              const item = settings.items[kind]
              return (
                <div key={kind} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 flex-1 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={e => updateItem(kind, { enabled: e.target.checked })}
                      className="w-4 h-4 accent-green-500"
                    />
                    {REMINDER_LABELS[kind]}
                  </label>
                  <input
                    type="time"
                    value={item.time}
                    disabled={!item.enabled}
                    onChange={e => e.target.value && updateItem(kind, { time: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:text-gray-300"
                  />
                </div>
              )
            })}
            <p className="text-xs text-gray-400">
              💪 運動：その日まだ運動を記録していないときに通知します（タップで運動画面へ）
            </p>
            <p className="text-xs text-gray-400">
              🔥 連続記録ピンチ：その日まだ何も記録していないときに通知します
            </p>
          </div>

          {settings.enabled && (
            <button onClick={sendTest} className="mt-3 text-xs text-green-600 underline">
              テスト通知を送る
            </button>
          )}
        </>
      )}

      {message && <p className="text-xs text-orange-500 mt-2">{message}</p>}
    </div>
  )
}
