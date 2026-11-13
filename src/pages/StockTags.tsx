import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Nfc } from 'lucide-react'
import { isNative } from '../lib/auth'
import { fetchStockTags, markStockTagDone, type StockTag } from '../lib/stock'
import { onNfcWriteResult, startNfcWrite, stopNfcWrite, type NfcWriteResult } from '../lib/widget'

// 日用品の NFC タグをまとめて作る画面。「NFCタグ」シートの一覧を順に表示し、
// かざしたタグに次の内容を書き込んで、書けたらシートの「書き込み済み」にチェックを入れて次へ進む

type NfcState = 'starting' | 'ready' | 'off' | 'unavailable'

const ERROR_TEXT: Record<NonNullable<NfcWriteResult['error']>, string> = {
  'read-only': 'このタグは書き込み禁止（ロック済み）です。別のタグを使ってください',
  'too-small': 'このタグは容量が足りません。別のタグを使ってください',
  'not-ndef': 'このタグには書き込めません（対応していない種類です）',
  io: '書き込みの途中でタグが離れました。もう一度、しばらくかざしたままにしてください',
}

/** 保管場所とおすすめの品目だけにする */
const isPick = (t: StockTag) => t.type === 'place' || t.memo.includes('おすすめ')

export default function StockTags() {
  const [tags, setTags] = useState<StockTag[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [onlyPicks, setOnlyPicks] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [nfc, setNfc] = useState<NfcState>('starting')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const visible = useMemo(
    () => (tags ?? []).filter(t => !onlyPicks || isPick(t)),
    [tags, onlyPicks],
  )
  const current = visible.find(t => t.id === currentId) ?? null

  // NFC の結果はネイティブから届くので、最新の一覧と書き込み先を ref で持つ
  const visibleRef = useRef(visible)
  const currentRef = useRef(current)
  visibleRef.current = visible
  currentRef.current = current

  useEffect(() => {
    fetchStockTags().then(list => {
      setTags(list)
      setCurrentId(list.find(t => !t.done)?.id ?? null)
    }).catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [])

  // 絞り込みで今の書き込み先が見えなくなったら、見えている中の未書き込みに移る
  useEffect(() => {
    if (!tags || current) return
    setCurrentId(visible.find(t => !t.done)?.id ?? null)
  }, [tags, visible, current])

  const arm = useCallback((tag: StockTag | null) => {
    if (!isNative) return
    if (!tag) {
      stopNfcWrite().catch(() => {})
      return
    }
    startNfcWrite(tag.uri)
      .then(r => setNfc(!r.available ? 'unavailable' : r.enabled ? 'ready' : 'off'))
      .catch(() => setNfc('unavailable'))
  }, [])

  // 書き込み先が変わったら、次にかざしたタグに書く内容を変える
  useEffect(() => { arm(current) }, [current, arm])

  // 画面を離れたら書き込みモードを終える（タグをかざすと、また FitLog の画面が開くようになる）
  useEffect(() => () => { stopNfcWrite().catch(() => {}) }, [])

  useEffect(() => {
    const sub = onNfcWriteResult(result => {
      const tag = currentRef.current
      if (!tag || result.uri !== tag.uri) return
      if (!result.ok) {
        setMessage({ text: ERROR_TEXT[result.error ?? 'io'] ?? ERROR_TEXT.io, ok: false })
        return
      }
      setMessage({ text: `${tag.name} を書き込みました`, ok: true })
      setTags(prev => prev?.map(t => (t.id === tag.id ? { ...t, done: true } : t)) ?? prev)
      markStockTagDone(tag.id).catch(e =>
        setSaveError(`${tag.name} の「書き込み済み」をシートに付けられませんでした（${e instanceof Error ? e.message : String(e)}）`))
      // 一覧で今のタグより後ろの未書き込みへ。なければ前に戻って探す
      const list = visibleRef.current
      const i = list.findIndex(t => t.id === tag.id)
      const rest = [...list.slice(i + 1), ...list.slice(0, Math.max(i, 0))]
      setCurrentId(rest.find(t => !t.done && t.id !== tag.id)?.id ?? null)
    })
    return () => { sub.then(s => s.remove()).catch(() => {}) }
  }, [])

  const doneCount = visible.filter(t => t.done).length

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-1.5 px-1">
        <Nfc size={18} className="text-amber-500" />
        <h1 className="text-lg font-bold text-gray-800 flex-1">NFCタグを書き込む</h1>
        <Link to="/" className="text-xs text-gray-400 underline">ホームへ</Link>
      </div>

      {!isNative ? (
        <p className="text-sm text-gray-500 px-1">タグの書き込みは Android アプリでだけ使えます。</p>
      ) : loadError ? (
        <p className="text-sm text-gray-500 px-1">「NFCタグ」シートを読めませんでした（{loadError}）</p>
      ) : !tags ? (
        <p className="text-sm text-gray-400 text-center py-10">読み込み中...</p>
      ) : (
        <>
          <div className={`rounded-2xl p-5 shadow-sm text-center border ${current ? 'bg-amber-50 border-amber-200' : 'bg-white border-transparent'}`}>
            {nfc === 'unavailable' ? (
              <p className="text-sm text-gray-600">この端末では NFC を使えません。</p>
            ) : nfc === 'off' ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">NFC がオフになっています。設定で NFC をオンにしてから押してください。</p>
                <button onClick={() => arm(current)} className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-600">
                  もう一度確かめる
                </button>
              </div>
            ) : current ? (
              <>
                <p className="text-xs text-amber-700">次にかざすタグ</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{current.name || current.id}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {current.type === 'place' ? '保管場所' : current.place}・{current.id}{current.done ? '・書き込み済み（書き直す）' : ''}
                </p>
                <p className="text-sm text-amber-700 mt-4">スマホの背面にタグを当てて、書き込めるまで動かさない</p>
              </>
            ) : (
              <p className="text-sm text-gray-600">この一覧のタグはすべて書き込みました。書き直すときは、下の一覧から選んでください。</p>
            )}
          </div>

          {message && (
            <p className={`text-sm text-center ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
              {message.ok ? '✅ ' : '⚠️ '}{message.text}
            </p>
          )}
          {saveError && <p className="text-xs text-red-600 px-1">{saveError}</p>}

          <div className="flex items-center gap-2 px-1">
            <p className="text-xs text-gray-500 flex-1">書き込み済み {doneCount} / {visible.length}</p>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={onlyPicks}
                onChange={e => setOnlyPicks(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              保管場所とおすすめだけ
            </label>
          </div>

          <TagList tags={visible} currentId={current?.id ?? null} onSelect={t => { setMessage(null); setCurrentId(t.id) }} />
        </>
      )}
    </div>
  )
}

/** 保管場所のタグ、続いて品目のタグを保管場所ごとに。タップでその行を書き込み先にする */
function TagList({ tags, currentId, onSelect }: {
  tags: StockTag[]
  currentId: string | null
  onSelect: (t: StockTag) => void
}) {
  const groups: { title: string; tags: StockTag[] }[] = []
  const places = tags.filter(t => t.type === 'place')
  if (places.length) groups.push({ title: '保管場所（棚卸しのときにかざす）', tags: places })
  for (const t of tags.filter(t => t.type === 'item')) {
    const title = t.place || '保管場所 未設定'
    const g = groups.find(x => x.title === title)
    if (g) g.tags.push(t)
    else groups.push({ title, tags: [t] })
  }

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <div key={g.title}>
          <p className="text-xs text-gray-500 px-1 mb-1">{g.title}</p>
          <ul className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
            {g.tags.map(t => (
              <li key={t.id}>
                <button
                  onClick={() => onSelect(t)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${t.id === currentId ? 'bg-amber-50' : ''}`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${t.done ? 'bg-green-500 text-white' : 'border border-gray-300'}`}>
                    {t.done && <Check size={12} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm truncate ${t.done ? 'text-gray-400' : 'text-gray-700'}`}>{t.name || t.id}</span>
                    <span className="block text-xs text-gray-400 truncate">{t.id}{t.memo ? `・${t.memo}` : ''}</span>
                  </span>
                  {t.id === currentId && <span className="text-xs text-amber-700 shrink-0">次</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
