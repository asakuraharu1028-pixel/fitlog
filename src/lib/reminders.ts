import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { AppData, ReminderKind, ReminderSettings } from '../types'
import type { AdvisorCharacterId } from './characters'
import { isNative } from './auth'
import { computeAllStreaks, recordedDates, STREAK_CATEGORIES, STREAK_CATEGORY_META, type StreakCategory } from './streak'
import { hasExerciseOn } from './quickexercise'
import { localDateStr } from './utils'
import { careLogOn, resolveCareItems } from './selfcare'
import { loadStockStatus, resolveStockReminder, stockAppUrl } from './stock'

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

// セルフケアは「責められるとやめたくなる」習慣なので、どのキャラも最低ラインを勧める優しめの文にする
const CARE_MESSAGES: Record<AdvisorCharacterId, (minimum: string) => string> = {
  default:  min => `${min}だけでも「できた」です。終わったらタップで記録できます。`,
  kenmochi: min => `${min}だけでいいですよ。それくらいなら、さすがにできるでしょう。`,
  gaku:     min => `${min}だけでOKっす！サクッとやっちゃいましょ✌️`,
  togabito: min => `剣持：${min}だけでいいんですよ。\nガク：それだけでも立派っす！`,
  domoto:   min => `光一：${min}だけでええねん。\n剛：ちょっとやったら、気持ちええで。`,
}

// 日用品の在庫。棚卸しは「その場所だけ5分」、要購入は「注文するだけ」と、すぐ済むことを伝える
const STOCK_MESSAGES: Record<AdvisorCharacterId, { stocktake: (place: string, n: number) => string; low: (names: string) => string }> = {
  default: {
    stocktake: (place, n) => `今週は「${place}」の${n}品目だけ数えましょう。5分ほどで終わります。タップで棚卸し画面が開きます。`,
    low:       names => `${names}が残りわずかです。ホームからAmazonの注文ページを開けます。`,
  },
  kenmochi: {
    stocktake: (place, n) => `今週は「${place}」の${n}品目だけですよ。5分で終わる作業を先延ばしにする理由、ありますか。`,
    low:       names => `${names}、もうすぐ切れますよ。切れてから慌てるの、毎回やってません？`,
  },
  gaku: {
    stocktake: (place, n) => `今週は「${place}」の${n}品目だけっす！5分でサクッと数えちゃいましょ✌️`,
    low:       names => `${names}がもうすぐなくなるっす！今のうちにポチっとしときましょ🛒`,
  },
  togabito: {
    stocktake: (place, n) => `剣持：今週は「${place}」の${n}品目だけですよ。
ガク：5分で終わるっす、一緒にやりましょ！`,
    low:       names => `剣持：${names}、切れかけてますよ。
ガク：今のうちに注文しとけば安心っす🛒`,
  },
  domoto: {
    stocktake: (place, n) => `光一：今週は「${place}」の${n}品目だけや。すぐ終わるで。
剛：数えるだけやから、気楽にいこか。`,
    low:       names => `光一：${names}、もうすぐ切れるで。
剛：なくなる前に頼んどこなぁ。`,
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
// セルフケア通知の ID 範囲（1日あたり最大 CARE_PER_DAY 項目）
const CARE_ID_BASE = 20000
const CARE_PER_DAY = 50
const CARE_ID_MAX  = CARE_ID_BASE + DAYS_AHEAD * CARE_PER_DAY
const CHANNEL_ID = 'reminders'

// セルフケアを使い始めて一定日数たったら、フェーズ2（NFC・通知から記録）を検討する合図を1回だけ出す
const PHASE2_ID = 30000
const PHASE2_AFTER_DAYS = 14
const PHASE2_TIME = '20:00'

// 日用品の在庫の通知 ID（棚卸しは日ごと、要購入は1件にまとめる）
const STOCK_LOW_ID = 30050
const STOCKTAKE_ID_BASE = 30100
const STOCKTAKE_ID_MAX = STOCKTAKE_ID_BASE + DAYS_AHEAD
// 要購入の通知を出せる時間帯（この外なら次の朝に回す）
const STOCK_LOW_FROM_HOUR = 7
const STOCK_LOW_TO_HOUR = 22
// 要購入になった品目ごとの通知時刻（ms）。同じ品目は、補充されて要購入でなくなるまで二度通知しない
const STOCK_LOW_NOTIFIED_KEY = 'fitlog-stock-low-notified'

const isOurId = (id: number) =>
  (id >= ID_BASE && id < ID_MAX) || (id >= CARE_ID_BASE && id < CARE_ID_MAX) || id === PHASE2_ID ||
  id === STOCK_LOW_ID || (id >= STOCKTAKE_ID_BASE && id < STOCKTAKE_ID_MAX)

/** 要購入の通知を出す時刻：今から1分後。夜間なら次の朝 */
function nextStockLowTime(now: Date): number {
  const at = new Date(now.getTime() + 60 * 1000)
  if (at.getHours() >= STOCK_LOW_TO_HOUR) at.setDate(at.getDate() + 1)
  if (at.getHours() >= STOCK_LOW_TO_HOUR || at.getHours() < STOCK_LOW_FROM_HOUR) at.setHours(STOCK_LOW_FROM_HOUR, 0, 0, 0)
  return at.getTime()
}

function readLowNotified(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STOCK_LOW_NOTIFIED_KEY) || '{}') } catch { return {} }
}

/** 日用品の在庫：毎週の棚卸し（確認が古い保管場所があるときだけ）と、新しく要購入になった品目 */
function stockNotifications(data: AppData, now: Date, character: AdvisorCharacterId): LocalNotificationSchema[] {
  const settings = resolveStockReminder(data.settings.stock)
  const status = loadStockStatus()
  if (!settings.enabled || !status) return []
  const notifications: LocalNotificationSchema[] = []

  const st = status.stocktake
  if (st) {
    const [h, m] = settings.stocktakeTime.split(':').map(Number)
    const body = STOCK_MESSAGES[character].stocktake(st.place, st.itemCount)
    for (let day = 0; day < DAYS_AHEAD; day++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, m)
      if (at.getDay() !== settings.stocktakeDay || at <= now) continue
      notifications.push({
        id: STOCKTAKE_ID_BASE + day,
        title: `📦 今週の棚卸し：${st.place}`,
        body,
        largeBody: body,
        channelId: CHANNEL_ID,
        schedule: { at, allowWhileIdle: true },
        extra: { url: stockAppUrl(status, st.placeId) },
      })
    }
  }

  // 予約し直しても通知時刻が変わらないよう、品目ごとに最初に決めた時刻を覚えておく
  const notified = readLowNotified()
  const next: Record<string, number> = {}
  status.low.forEach(item => { next[item.name] = notified[item.name] ?? nextStockLowTime(now) })
  try { localStorage.setItem(STOCK_LOW_NOTIFIED_KEY, JSON.stringify(next)) } catch { /* 次回また通知されるだけ */ }
  const pending = Object.keys(next).filter(name => next[name] > now.getTime())
  if (pending.length > 0) {
    const body = STOCK_MESSAGES[character].low(pending.join('、'))
    notifications.push({
      id: STOCK_LOW_ID,
      title: `🛒 要購入：${pending[0]}${pending.length > 1 ? `ほか${pending.length - 1}品` : ''}`,
      body,
      largeBody: body,
      channelId: CHANNEL_ID,
      schedule: { at: new Date(Math.min(...pending.map(name => next[name]))), allowWhileIdle: true },
      extra: { route: '/' },
    })
  }
  return notifications
}

/** 最初のセルフケア記録から PHASE2_AFTER_DAYS 日後の通知。すでに過ぎていれば null */
function phase2Notification(data: AppData, now: Date): LocalNotificationSchema | null {
  const first = (data.careLogs ?? []).map(l => l.date).sort()[0]
  if (!first) return null
  const [h, m] = PHASE2_TIME.split(':').map(Number)
  const at = new Date(first + 'T00:00:00')
  at.setDate(at.getDate() + PHASE2_AFTER_DAYS)
  at.setHours(h, m, 0, 0)
  if (at <= now) return null
  const body = `セルフケアを記録し始めて${PHASE2_AFTER_DAYS}日たちました。` +
    'ホームの実施率を見て、記録が面倒で抜けているならフェーズ2（NFCタグ・通知から記録）に進む時期です。'
  return {
    id: PHASE2_ID,
    title: '🌱 セルフケア：フェーズ2を検討するタイミングです',
    body,
    largeBody: body,
    channelId: CHANNEL_ID,
    schedule: { at, allowWhileIdle: true },
    extra: { route: '/' },
  }
}

function isRecorded(data: AppData, kind: ReminderKind, date: string): boolean {
  switch (kind) {
    case 'weight': return data.bodyRecords.some(r => r.date === date)
    case 'exercise': return hasExerciseOn(data, date)
    // 連続中のカテゴリがすべて記録済みで、今日なにか1件でも記録がある
    case 'streak': return atRiskCategories(data, date).length === 0 && recordedDates(data).has(date)
    default:       return data.mealLogs.some(m => m.date === date && m.mealType === kind)
  }
}

/** 連続中なのに今日まだ記録していないカテゴリ */
function atRiskCategories(data: AppData, today: string): StreakCategory[] {
  const streaks = computeAllStreaks(data, today)
  return STREAK_CATEGORIES.filter(c => streaks[c].current > 0 && !streaks[c].todayRecorded)
}

function buildSchedule(data: AppData): LocalNotificationSchema[] {
  const settings = resolveReminderSettings(data.settings.reminders)
  if (!settings.enabled) return []

  const character = data.settings.advisorCharacter ?? 'default'
  const now = new Date()
  const today = localDateStr(now)
  const atRisk = atRiskCategories(data, today)
  const atRiskLabel = atRisk.map(c => STREAK_CATEGORY_META[c].label).join('・')
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
        ? (day === 0 && atRisk.length > 0 ? `🔥 ${atRiskLabel}の連続が途切れそう！` : '🔥 今日の記録がまだです')
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

    // セルフケア（育成中・定着済みで通知ONの項目）
    resolveCareItems(data)
      .filter(item => item.status !== 'paused' && item.reminderEnabled)
      .slice(0, CARE_PER_DAY)
      .forEach((item, i) => {
        const [h, m] = (item.reminderTime ?? '21:00').split(':').map(Number)
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, m)
        if (at <= now) return
        if (day === 0 && careLogOn(data, item.id, today)) return
        const body = CARE_MESSAGES[character](item.minimum || '少しだけ')
        notifications.push({
          id: CARE_ID_BASE + day * CARE_PER_DAY + i,
          title: item.anchor ? `${item.icon} ${item.anchor}、${item.label}` : `${item.icon} ${item.label}の時間です`,
          body,
          largeBody: body,
          channelId: CHANNEL_ID,
          schedule: { at, allowWhileIdle: true },
          extra: { route: '/' },
        })
      })
  }

  const phase2 = phase2Notification(data, now)
  if (phase2) notifications.push(phase2)
  notifications.push(...stockNotifications(data, now, character))
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
      const ours = pending.filter(n => isOurId(n.id))
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
    const { route, url } = event.notification.extra ?? {}
    // 在庫アプリなど外のページはブラウザで開く
    if (typeof url === 'string') window.open(url, '_blank')
    else if (typeof route === 'string') window.location.hash = '#' + route
  })
}
