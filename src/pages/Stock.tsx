import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, ExternalLink, Nfc, Package, RefreshCw } from 'lucide-react'
import { isNative } from '../lib/auth'
import { useAppStore } from '../lib/store'
import { syncReminders } from '../lib/reminders'
import {
  amazonUrl, changeStockItem, fetchStockItem, isStockConfigured, stockAppUrl, useStockStore, type StockItem,
} from '../lib/stock'

// 日用品の画面。メニューから開くと要購入・棚卸し・在庫アプリ・タグ書き込みへの入口を出す。
// NFC タグ（fitlog://stock?item=T01 / ?place=P01）から開いたときは、
// 品目タグはここで「使った」を記録し、保管場所タグは家計簿GASの在庫アプリ（棚卸し画面）をブラウザで開く

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

function ItemView({ id }: { id: string }) {
  const [item, setItem] = useState<StockItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 直前に「使った」を押した数（取り消し用）
  const [lastUsed, setLastUsed] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // タグを読んだだけでは減らさない。表示して「使った」を押してもらう
    fetchStockItem(id).then(setItem).catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [id])

  const change = async (delta: number, reason: '使った' | '取り消し') => {
    if (!item || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const next = await changeStockItem(item.id, delta, reason)
      setItem(next)
      setLastUsed(reason === '使った' ? -delta : 0)
      setMessage(reason === '使った' ? `${-delta}つ使ったと記録しました` : '取り消しました')
      afterChange()
    } catch (e) {
      setMessage(`記録できませんでした（${e instanceof Error ? e.message : String(e)}）`)
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

  const low = item.count !== null && item.count <= item.min
  return (
    <>
      <div className={`rounded-2xl p-5 shadow-sm text-center border ${low ? 'bg-amber-50 border-amber-200' : 'bg-white border-transparent'}`}>
        <p className="text-xl font-bold text-gray-800">{item.name}</p>
        <p className="text-xs text-gray-400 mt-1">{item.place || '保管場所 未設定'}</p>
        <p className="text-6xl font-bold text-gray-800 mt-4 mb-1">{item.count ?? '?'}</p>
        <p className="text-xs text-gray-500">
          発注点 {item.min}{low ? '・要購入' : ''}{item.count === null ? '・まだ数えていません' : ''}
        </p>
      </div>

      <button
        onClick={() => change(-item.step, '使った')}
        disabled={busy}
        className="w-full py-4 rounded-2xl bg-amber-500 text-white text-lg font-bold shadow-sm disabled:opacity-50"
      >
        {item.step}つ使った
      </button>
      {lastUsed > 0 && (
        <button
          onClick={() => change(lastUsed, '取り消し')}
          disabled={busy}
          className="w-full py-3 rounded-2xl bg-white text-gray-600 border border-gray-200 text-sm disabled:opacity-50"
        >
          取り消す（{lastUsed}つ戻す）
        </button>
      )}
      {message && <p className="text-sm text-center text-gray-600">{message}</p>}

      <div className="flex gap-2">
        <a
          href={`${item.appUrl}?item=${encodeURIComponent(item.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 text-center text-sm text-gray-600"
        >
          数を直す（棚卸し）
        </a>
        {low && (
          <a
            href={item.url || `https://www.amazon.co.jp/s?k=${encodeURIComponent(item.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center text-sm text-amber-700"
          >
            Amazonで注文
          </a>
        )}
      </div>
    </>
  )
}

/** 保管場所タグ：棚卸しは在庫アプリで行うので、その場所の画面をブラウザで開く */
function PlaceView({ id }: { id: string }) {
  const status = useStockStore(s => s.status)
  const opened = useRef(false)

  useEffect(() => {
    if (!status) useStockStore.getState().refresh(true)
  }, [status])

  const url = status ? stockAppUrl(status, id) : null
  useEffect(() => {
    if (!url || opened.current) return
    opened.current = true
    window.open(url, '_blank')
  }, [url])

  if (!url) return <p className="text-sm text-gray-400 text-center py-10">読み込み中...</p>
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <p className="text-sm text-gray-600">保管場所「{id}」の棚卸し画面をブラウザで開きました。</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center text-sm text-amber-700"
      >
        もう一度開く
      </a>
    </div>
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
        <a
          href={stockAppUrl(status, st.placeId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">📦 今週の棚卸し：{st.place}</p>
            <p className="text-xs text-amber-700/80">
              {st.itemCount}品目・{st.lastChecked ? `最終確認 ${st.lastChecked.slice(5).replace('-', '/')}` : '未確認の品目あり'}
            </p>
          </div>
          <span className="text-xs text-amber-700 shrink-0">開く ›</span>
        </a>
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
            <span className="block text-xs text-gray-400 truncate">数を直す・棚卸し・品目の追加（ブラウザで開く）</span>
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
