import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { AppData, ReminderKind, ReminderSettings } from '../types'
import type { AdvisorCharacterId } from './characters'
import { isNative } from './auth'
import { computeStreak, recordedDates } from './streak'
import { hasExerciseOn } from './quickexercise'
import { localDateStr } from './utils'

export const REMINDER_KINDS: ReminderKind[] = ['weight', 'breakfast', 'lunch', 'dinner', 'exercise', 'streak']

export const REMINDER_LABELS: Record<ReminderKind, string> = {
  weight:    '⚖️ 体重',
  breakfast: '🍳 朝食',
  lunch:     '🍱 昼食',
  dinner:    '🍽️ 夕食',
  exercise:  '💪 運動',
  streak:    '🔥 連続記録ピンチ',
}

const DEFAULT_TIMES: Record<ReminderKind, string> = {
  weight:    '07:30',
  breakfast: '09:30',
  lunch:     '13:30',
  dinner:    '20:30',
  exercise:  '19:00',
  streak:    '22:00',
}

const ROUTES: Record<ReminderKind, string> = {
  weight:    '/body',
  breakfast: '/meal',
  lunch:     '/meal',
  dinner:    '/meal',
  exercise:  '/exercise',
  streak:    '/',
}

const TITLES: Record<Exclude<ReminderKind, 'streak'>, string> = {
  weight:    '⚖️ 体重を記録しましょう',
  breakfast: '🍳 朝食の記録がまだです',
  lunch:     '🍱 昼食の記録がまだです',
  dinner:    '🍽️ 夕食の記録がまだです',
  exercise:  '💪 今日の運動、1つだけやりませんか',
}

// 通知本文は選択中のアドバイザーキャラのセリフにする（API を呼ばない固定文）
const MESSAGES: Record<AdvisorCharacterId, Record<ReminderKind, string>> = {
  default: {
    weight:    '朝の体重を記録しましょう。毎日同じタイミングで量るのがコツです。',
    breakfast: '朝食の記録がまだのようです。食べなかった場合も「食べなかった」で記録できます。',
    lunch:     '昼食の記録をお願いします。写真を撮るだけでも大丈夫です。',
    dinner:    '夕食の記録はお済みですか？今日の振り返りにもなります。',
    exercise:  'スクワット10回やストレッチ5分だけでも十分です。終わったらワンタップで記録できます。',
    streak:    '今日はまだ記録がありません。何か1件だけでも記録して連続を守りましょう。',
  },
  kenmochi: {
    weight:    '体重、まだ量ってないですよね。現実から目を逸らしても数字は変わらないですよ。',
    breakfast: '朝食の記録がないんですが。食べてないのか、記録を怠っただけなのか、どっちですか。',
    lunch:     '昼食、記録してないでしょ。写真1枚撮るだけの作業がそんなに億劫ですか。',
    dinner:    '夕食の記録がまだですね。一日の締めくくりくらいちゃんとしましょうよ。',
    exercise:  '今日まだ一度も体を動かしてないですよね。スクワット10回すらできないとは言わせませんよ。',
    streak:    'は？今日まだ何も記録してないんですか。積み上げた連続記録を自ら捨てる気ですか。',
  },
  gaku: {
    weight:    'おはようございます！体重チェックの時間っすよ、サクッと量っちゃいましょ✌️',
    breakfast: '朝ごはん食べました？記録しとくと後でマジ楽っすよ！',
    lunch:     'お昼の記録まだっすね！写真パシャっと撮るだけでOKっす🕺',
    dinner:    '晩ごはんお疲れさまです！記録して今日も締めましょ✌️',
    exercise:  'ちょっとだけ体動かしません？スクワット10回でOKっす、一緒にやりましょ💪',
    streak:    '今日の記録まだっすけど大丈夫ですか？1件だけでいいんで、連続記録守りましょ！',
  },
  togabito: {
    weight:    '剣持：体重計、乗りました？\nガク：刀也さん厳しい！でも朝のうちに量っちゃいましょ✌️',
    breakfast: '剣持：朝食の記録がないんですけど。\nガク：食べてなくても「食べなかった」で記録できますよ！',
    lunch:     '剣持：昼食の記録、まさか忘れてないですよね。\nガク：写真撮るだけでOKっす🕺',
    dinner:    '剣持：夕食の記録で一日が完結するんですよ。\nガク：今日も最後まで頑張りましょ！',
    exercise:  '剣持：今日、運動しました？してないですよね。\nガク：ストレッチ5分だけでも全然アリっすよ！',
    streak:    '剣持：連続記録、今日で途切れさせる気ですか？\nガク：1件だけでいいんで記録しましょ、応援してます✌️',
  },
  domoto: {
    weight:    '光一：体重量ってへんやろ。量らな何も始まらへんで。\n剛：数字は嘘つかへんからなぁ……ちょっと怖いけど。',
    breakfast: '光一：朝飯の記録ないやん。お前何してんねん。\n剛：朝は大事やからなぁ。食べたんやったら残しとこ。',
    lunch:     '光一：昼の記録まだか。管理する気あるんか。\n剛：写真撮るだけでええねんて、あなた。',
    dinner:    '光一：晩飯の記録で一日が締まるんや。\n剛：今日のごはん、何やったんやろなぁ。',
    exercise:  '光一：今日まだ体動かしてへんやろ。スクワット10回くらいやれるやろ。\n剛：ちょっと伸びするだけでも、気持ちええもんやで。',
    streak:    '光一：今日まだ何も記録してへんやん。こんなん続ける気ないのと一緒や。\n剛：まあでも、1個だけでも書いたら繋がるんちゃうかなぁ。',
  },
}

export type ResolvedReminderSettings = {
  enabled: boolean
  items: Record<ReminderKind, { enabled: boolean; time: string }>
}

/** 未設定の項目をデフォルトで埋めた設定を返す（初期状態は通知OFF・各項目ON） */
export function resolveReminderSettings(s?: ReminderSettings): ResolvedReminderSettings {
  const items = {} as ResolvedReminderSettings['items']
  for (const kind of REMINDER_KINDS) {
    items[kind] = { enabled: true, time: DEFAULT_TIMES[kind], ...s?.items?.[kind] }
  }
  return { enabled: s?.enabled ?? false, items }
}

// 予約しておく日数。アプリを開く・記録するたびに予約し直すので、この期間は放置しても通知が届く
const DAYS_AHEAD = 14
// 他の通知と ID が被らないようにするための範囲
const ID_BASE = 10000
const ID_MAX  = ID_BASE + DAYS_AHEAD * 10
const CHANNEL_ID = 'reminders'

function isRecorded(data: AppData, kind: ReminderKind, date: string): boolean {
  switch (kind) {
    case 'weight': return data.bodyRecords.some(r => r.date === date)
    case 'exercise': return hasExerciseOn(data, date)
    case 'streak': return recordedDates(data).has(date)
    default:       return data.mealLogs.some(m => m.date === date && m.mealType === kind)
  }
}

function buildSchedule(data: AppData): LocalNotificationSchema[] {
  const settings = resolveReminderSettings(data.settings.reminders)
  if (!settings.enabled) return []

  const character = data.settings.advisorCharacter ?? 'default'
  const now = new Date()
  const today = localDateStr(now)
  const streak = computeStreak(data, today).current
  const notifications: LocalNotificationSchema[] = []

  for (let day = 0; day < DAYS_AHEAD; day++) {
    REMINDER_KINDS.forEach((kind, i) => {
      const item = settings.items[kind]
      if (!item.enabled) return
      const [h, m] = item.time.split(':').map(Number)
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, m)
      if (at <= now) return
      // 今日すでに記録済みの項目は通知しない（翌日以降は記録状況が分からないので常に予約）
      if (day === 0 && isRecorded(data, kind, today)) return

      const title = kind === 'streak'
        ? (day === 0 && streak > 0 ? `🔥 ${streak}日連続が途切れそう！` : '🔥 今日の記録がまだです')
        : TITLES[kind]
      notifications.push({
        id: ID_BASE + day * 10 + i,
        title,
        body: MESSAGES[character][kind],
        largeBody: MESSAGES[character][kind],
        channelId: CHANNEL_ID,
        schedule: { at, allowWhileIdle: true },
        extra: { route: ROUTES[kind] },
      })
    })
  }
  return notifications
}

let channelCreated = false

/** 通知チャンネルを作成する（作成済みなら何もしない） */
export async function ensureReminderChannel() {
  if (channelCreated) return
  await LocalNotifications.createChannel({
    id: CHANNEL_ID, name: '記録リマインド', importance: 4, visibility: 1,
  })
  channelCreated = true
}

let lastKey = ''
let queue: Promise<void> = Promise.resolve()

/**
 * 通知の予約をデータに合わせて作り直す。
 * 保存のたびに呼ばれるので、予約内容が変わらなければ何もしない。
 */
export function syncReminders(data: AppData): Promise<void> {
  if (!isNative) return Promise.resolve()
  // 連続して呼ばれても cancel/schedule が入れ違わないよう直列に実行する
  queue = queue.then(async () => {
    try {
      const notifications = buildSchedule(data)
      const key = JSON.stringify(notifications.map(n => [n.id, n.schedule?.at?.getTime(), n.title, n.body]))
      if (key === lastKey) return

      if (notifications.length > 0) {
        const { display } = await LocalNotifications.checkPermissions()
        if (display !== 'granted') return
        await ensureReminderChannel()
      }

      const { notifications: pending } = await LocalNotifications.getPending()
      const ours = pending.filter(n => n.id >= ID_BASE && n.id < ID_MAX)
      if (ours.length > 0) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) })
      if (notifications.length > 0) await LocalNotifications.schedule({ notifications })
      lastKey = key
    } catch (e) {
      console.warn('Reminder sync error:', e)
    }
  })
  return queue
}

/** 通知の許可を求める。許可されたら true */
export async function requestReminderPermission(): Promise<boolean> {
  if (!isNative) return false
  const { display } = await LocalNotifications.requestPermissions()
  return display === 'granted'
}

let listenerAdded = false

/** 通知タップで該当画面に移動する */
export function initReminderListeners() {
  if (!isNative || listenerAdded) return
  listenerAdded = true
  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const route = event.notification.extra?.route
    if (typeof route === 'string') window.location.hash = '#' + route
  })
}
