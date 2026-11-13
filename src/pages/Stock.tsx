import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, ExternalLink, Nfc, Package, RefreshCw } from 'lucide-react'
import { isNative } from '../lib/auth'
import { useAppStore } from '../lib/store'
import { syncReminders } from '../lib/reminders'
import { localDateStr } from '../lib/utils'
import {
  amazonUrl, changeStockItem, fetchStockItem, fetchStockPlace, isStockConfigured, setStockCount, setStockPlace,
  stockAppUrl, useStockStore, type StockItem, type StockItemDetail, type StockPlaceDetail,
} from '../lib/stock'

// 日用品の画面。メニューから開くと要購入・棚卸し・在庫アプリ・タグ書き込みへの入口を出す。
// NFC タグ（fitlog://stock?item=T01 / ?place=P01）から開いたときは、
// 品目タグは「使った」・数を直す・保管場所を変える、保管場所タグはその場所の棚卸しをこの画面で行う

/** 在庫が変わったら、ホームのカードと通知（要購入）を新しい状況に合わせる */
function afterChange() {
  useStockStore.getState().refresh(true).then(status => {
    if (status) syncReminders(useAppStore.getState().data)
  })
}

export default function Stock() {
  const [params] = useSearchParams()
  const itemId = params.get('item')
  const placeId = params.get('place')

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-1.5 px-1">
        <Package size={18} className="text-amber-500" />
        <h1 className="text-lg font-bold text-gray-800 flex-1">日用品</h1>
        <Link to="/" className="text-xs text-gray-400 underline">ホームへ</Link>
      </div>
      {itemId ? <ItemView key={itemId} id={itemId} />
        : placeId ? <PlaceView key={placeId} id={placeId} />
        : <StockHub />}
    </div>
  )
}

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

/** 最終確認日を「11/13」の形に */
function shortDate(ymd: string | null) {
  return ymd ? ymd.slice(5).replace('-', '/') : null
}

function ItemView({ id }: { id: string }) {
  const [item, setItem] = useState<StockItemDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 直前に「使った」を押した数（取り消し用）
  const [lastUsed, setLastUsed] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  // 開いている編集欄
  const [editing, setEditing] = useState<'count' | 'place' | null>(null)
  const [countInput, setCountInput] = useState('')
  const [placeInput, setPlaceInput] = useState('')

  useEffect(() => {
    // タグを読んだだけでは減らさない。表示して「使った」を押してもらう
    fetchStockItem(id).then(setItem).catch(e => setError(errText(e)))
  }, [id])

  /** 書き込みを1つ行い、結果の品目とメッセージを出す */
  const run = async (fn: () => Promise<StockItemDetail>, done: (next: StockItemDetail) => string) => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const next = await fn()
      setItem(next)
      setMessage(done(next))
      afterChange()
    } catch (e) {
      setMessage(`記録できませんでした（${errText(e)}）`)
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <p className="text-sm text-gray-500 px-1">
        品目「{id}」を読めませんでした（{error === 'item not found' ? '在庫シートにこのIDの品目がありません' : error}）
      </p>
    )
  }
  if (!item) return <p className="text-sm text-gray-400 text-center py-10">読み込み中...</p>

  const use = () => run(() => changeStockItem(item.id, -item.step, '使った'), () => {
    setLastUsed(item.step)
    return `${item.step}つ使ったと記録しました`
  })
  const undo = () => run(() => changeStockItem(item.id, lastUsed, '取り消し'), () => {
    setLastUsed(0)
    return '取り消しました'
  })
  const openEditor = (kind: 'count' | 'place') => {
    setMessage(null)
    if (editing === kind) {
      setEditing(null)
      return
    }
    setEditing(kind)
    if (kind === 'count') setCountInput(item.count === null ? '' : String(item.count))
    else setPlaceInput(item.places.find(p => p.name === item.place)?.id ?? item.places[0]?.id ?? '')
  }
  const countValue = /^\d+$/.test(countInput) ? Number(countInput) : null
  const saveCount = () => {
    if (countValue === null) return
    run(() => setStockCount(item.id, countValue), next => {
      setEditing(null)
      setLastUsed(0)
      return `数を ${next.count} にしました（棚卸し）`
    })
  }
  const savePlace = () => {
    if (!placeInput) return
    run(() => setStockPlace(item.id, placeInput), next => {
      setEditing(null)
      return `保管場所を「${next.place}」に変えました`
    })
  }

  const low = item.count !== null && item.count <= item.min
  const editBtn = (kind: 'count' | 'place') =>
    `flex-1 py-2.5 rounded-xl border text-sm ${editing === kind ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-gray-200 text-gray-600'}`

  return (
    <>
      <div className={`rounded-2xl p-5 shadow-sm text-center border ${low ? 'bg-amber-50 border-amber-200' : 'bg-white border-transparent'}`}>
        <p className="text-xl font-bold text-gray-800">{item.name}</p>
        <p className="text-xs text-gray-400 mt-1">{item.place || '保管場所 未設定'}</p>
        <p className="text-6xl font-bold text-gray-800 mt-4 mb-1">{item.count ?? '?'}</p>
        <p className="text-xs text-gray-500">
          発注点 {item.min}{low ? '・要購入' : ''}{item.count === null ? '・まだ数えていません' : ''}
          {item.checked ? `・確認 ${shortDate(item.checked)}` : ''}
        </p>
      </div>

      <button
        onClick={use}
        disabled={busy}
        className="w-full py-4 rounded-2xl bg-amber-500 text-white text-lg font-bold shadow-sm disabled:opacity-50"
      >
        {item.step}つ使った
      </button>
      {lastUsed > 0 && (
        <button
          onClick={undo}
          disabled={busy}
          className="w-full py-3 rounded-2xl bg-white text-gray-600 border border-gray-200 text-sm disabled:opacity-50"
        >
          取り消す（{lastUsed}つ戻す）
        </button>
      )}
      {message && <p className="text-sm text-center text-gray-600">{message}</p>}

      <div className="flex gap-2">
        <button onClick={() => openEditor('count')} className={editBtn('count')}>数を直す（棚卸し）</button>
        <button onClick={() => openEditor('place')} className={editBtn('place')}>保管場所を変える</button>
      </div>

      {editing === 'count' && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-xs text-gray-500">いま実際にある数を入れてください。最終確認日も今日になります。</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCountInput(String(Math.max(0, (countValue ?? 0) - 1)))}
              className="w-12 h-12 rounded-xl border border-gray-200 text-xl text-gray-600"
              aria-label="1つ減らす"
            >−</button>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={countInput}
              onChange={e => setCountInput(e.target.value)}
              className="flex-1 min-w-0 h-12 border border-gray-200 rounded-xl text-center text-2xl font-bold"
              aria-label="在庫の数"
            />
            <button
              onClick={() => setCountInput(String((countValue ?? 0) + 1))}
              className="w-12 h-12 rounded-xl border border-gray-200 text-xl text-gray-600"
              aria-label="1つ増やす"
            >＋</button>
          </div>
          <button
            onClick={saveCount}
            disabled={busy || countValue === null}
            className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold disabled:opacity-50"
          >
            この数にする
          </button>
        </div>
      )}

      {editing === 'place' && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          {item.places.length === 0 ? (
            <p className="text-sm text-gray-500">保管場所シートに場所がありません。</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {item.places.map(p => (
                  <label key={p.id} className="flex items-center gap-2.5 px-1 py-1.5 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="place"
                      checked={placeInput === p.id}
                      onChange={() => setPlaceInput(p.id)}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span className="flex-1">{p.name}</span>
                    {p.name === item.place && <span className="text-xs text-gray-400">いまの場所</span>}
                  </label>
                ))}
              </div>
              <button
                onClick={savePlace}
                disabled={busy || !placeInput || item.places.find(p => p.id === placeInput)?.name === item.place}
                className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold disabled:opacity-50"
              >
                ここに移す
              </button>
              <p className="text-xs text-gray-400">新しい場所を作るときは、在庫アプリで追加してください。</p>
            </>
          )}
        </div>
      )}

      {low && (
        <a
          href={item.url || `https://www.amazon.co.jp/s?k=${encodeURIComponent(item.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center text-sm text-amber-700"
        >
          Amazonで注文
        </a>
      )}
    </>
  )
}

/** 保管場所タグ：その場所の品目を1つずつ数えて、数を確定していく（棚卸し） */
function PlaceView({ id }: { id: string }) {
  const [detail, setDetail] = useState<StockPlaceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 品目ごとの入力中の数（文字列）
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const today = localDateStr()

  useEffect(() => {
    fetchStockPlace(id).then(d => {
      setDetail(d)
      setInputs(Object.fromEntries(d.items.map(i => [i.id, i.count === null ? '' : String(i.count)])))
    }).catch(e => setError(errText(e)))
  }, [id])

  if (error) {
    return (
      <p className="text-sm text-gray-500 px-1">
        保管場所「{id}」を読めませんでした（{error === 'place not found' ? '保管場所シートにこのIDの場所がありません' : error}）
      </p>
    )
  }
  if (!detail) return <p className="text-sm text-gray-400 text-center py-10">読み込み中...</p>

  const valueOf = (itemId: string) => {
    const v = inputs[itemId] ?? ''
    return /^\d+$/.test(v) ? Number(v) : null
  }
  const isDone = (item: StockItem) => item.checked === today
  const doneCount = detail.items.filter(isDone).length

  const save = async (item: StockItem) => {
    const n = valueOf(item.id)
    if (n === null || saving.has(item.id)) return
    setSaving(s => new Set(s).add(item.id))
    setRowError(r => ({ ...r, [item.id]: '' }))
    try {
      const next = await setStockCount(item.id, n)
      setDetail(d => d && { ...d, items: d.items.map(i => (i.id === item.id ? { ...i, count: next.count, checked: next.checked } : i)) })
      setInputs(v => ({ ...v, [item.id]: String(next.count) }))
    } catch (e) {
      setRowError(r => ({ ...r, [item.id]: errText(e) }))
    } finally {
      setSaving(s => {
        const rest = new Set(s)
        rest.delete(item.id)
        return rest
      })
    }
  }

  // 数が入っていて、今日まだ確定していない品目をまとめて確定する
  const rest = detail.items.filter(i => !isDone(i) && valueOf(i.id) !== null)
  const saveRest = async () => {
    for (const item of rest) await save(item)
    afterChange()
  }

  return (
    <>
      <div className="px-1">
        <p className="text-base font-bold text-gray-800">📦 {detail.place.name} の棚卸し</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {detail.items.length}品目・今日確認済み {doneCount}。数が合っていれば、そのまま「OK」を押してください
        </p>
      </div>

      {detail.items.length === 0 ? (
        <p className="text-sm text-gray-500 px-1">この場所の品目はありません。</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {detail.items.map(item => {
            const done = isDone(item)
            const v = valueOf(item.id)
            return (
              <li key={item.id} className={`px-4 py-3 ${done ? 'bg-green-50/60' : ''}`}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Link to={`/stock?item=${encodeURIComponent(item.id)}`} className="block text-sm text-gray-700 truncate">
                      {item.name}
                    </Link>
                    <p className="text-xs text-gray-400 truncate">
                      {done ? `✅ 確認済み（${item.count}）` : item.checked ? `前回 ${shortDate(item.checked)}` : 'まだ数えていません'}
                      ・発注点 {item.min}
                    </p>
                  </div>
                  <button
                    onClick={() => setInputs(s => ({ ...s, [item.id]: String(Math.max(0, (v ?? 0) - 1)) }))}
                    className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 shrink-0"
                    aria-label={`${item.name}を1つ減らす`}
                  >−</button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={inputs[item.id] ?? ''}
                    onChange={e => setInputs(s => ({ ...s, [item.id]: e.target.value }))}
                    className="w-14 h-9 border border-gray-200 rounded-lg text-center font-bold shrink-0"
                    aria-label={`${item.name}の数`}
                  />
                  <button
                    onClick={() => setInputs(s => ({ ...s, [item.id]: String((v ?? 0) + 1) }))}
                    className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 shrink-0"
                    aria-label={`${item.name}を1つ増やす`}
                  >＋</button>
                  <button
                    onClick={() => { save(item).then(afterChange) }}
                    disabled={v === null || saving.has(item.id)}
                    className={`w-12 h-9 rounded-lg text-sm font-bold shrink-0 disabled:opacity-40 ${done ? 'bg-white border border-green-300 text-green-700' : 'bg-amber-500 text-white'}`}
                  >
                    {saving.has(item.id) ? '…' : 'OK'}
                  </button>
                </div>
                {rowError[item.id] && <p className="text-xs text-red-600 mt-1">記録できませんでした（{rowError[item.id]}）</p>}
              </li>
            )
          })}
        </ul>
      )}

      {rest.length > 1 && (
        <button
          onClick={saveRest}
          disabled={saving.size > 0}
          className="w-full py-3 rounded-2xl bg-amber-500 text-white font-bold shadow-sm disabled:opacity-50"
        >
          残り{rest.length}品目をこの数で確定
        </button>
      )}
    </>
  )
}

/** メニューから開いたとき：要購入、今週の棚卸し、在庫アプリとタグ書き込みへの入口 */
function StockHub() {
  const { status, error, loading, refresh } = useStockStore()

  // 開いたときは最新の在庫を読む
  useEffect(() => { useStockStore.getState().refresh(true) }, [])

  if (!isStockConfigured()) {
    return <p className="text-sm text-gray-500 px-1">日用品の在庫は、GAS 中継（VITE_RECIPE_PROXY_URL）を設定すると使えます。</p>
  }
  if (!status) {
    return error
      ? <p className="text-sm text-gray-500 px-1">在庫を読めませんでした（{error}）</p>
      : <p className="text-sm text-gray-400 text-center py-10">読み込み中...</p>
  }
  const st = status.stocktake

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">🛒 要購入</p>
          <button
            onClick={() => refresh(true)}
            disabled={loading}
            className="text-gray-400 disabled:opacity-40"
            aria-label="在庫を読み直す"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {status.low.length === 0 ? (
          <p className="text-sm text-gray-400">いまは要購入の品目はありません</p>
        ) : (
          <ul className="space-y-1.5">
            {status.low.map(item => (
              <li key={item.name} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400 truncate">残り{item.count}{item.place ? `・${item.place}` : ''}</p>
                </div>
                <a
                  href={amazonUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
                >
                  Amazon
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {st && (
        <Link
          to={`/stock?place=${encodeURIComponent(st.placeId)}`}
          className="flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">📦 今週の棚卸し：{st.place}</p>
            <p className="text-xs text-amber-700/80">
              {st.itemCount}品目・{st.lastChecked ? `最終確認 ${st.lastChecked.slice(5).replace('-', '/')}` : '未確認の品目あり'}
            </p>
          </div>
          <span className="text-xs text-amber-700 shrink-0">開く ›</span>
        </Link>
      )}

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
        <a
          href={stockAppUrl(status)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3"
        >
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-500">
            <Package size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-gray-700">在庫アプリを開く</span>
            <span className="block text-xs text-gray-400 truncate">品目の追加・名前や発注点の編集（ブラウザで開く）</span>
          </span>
          <ExternalLink size={16} className="text-gray-300 shrink-0" />
        </a>
        {isNative && (
          <Link to="/stock/tags" className="flex items-center gap-3 px-4 py-3">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-orange-50 text-orange-500">
              <Nfc size={20} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-gray-700">NFCタグを書き込む</span>
              <span className="block text-xs text-gray-400 truncate">「NFCタグ」シートの順にかざして書く</span>
            </span>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </Link>
        )}
      </div>
    </>
  )
}
