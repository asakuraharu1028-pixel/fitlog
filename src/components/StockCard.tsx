import { Package, RefreshCw } from 'lucide-react'
import { amazonUrl, isStockConfigured, stockAppUrl, useStockStore } from '../lib/stock'

/** 日用品の在庫（家計簿GAS）：要購入の品目と、今週棚卸しする保管場所。どちらもなければ出さない */
export default function StockCard() {
  const { status, error, loading, refresh } = useStockStore()
  if (!isStockConfigured()) return null
  if (!status) {
    return error ? <p className="text-xs text-gray-400 px-1">日用品の在庫を読めませんでした（{error}）</p> : null
  }
  const st = status.stocktake
  if (status.low.length === 0 && !st) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Package size={16} className="text-amber-500" />
          <h2 className="font-semibold text-gray-700">日用品</h2>
        </div>
        <button
          onClick={() => refresh(true)}
          disabled={loading}
          className="text-gray-400 disabled:opacity-40"
          aria-label="在庫を読み直す"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {status.low.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">🛒 要購入</p>
          <ul className="space-y-1.5">
            {status.low.map(item => (
              <li key={item.name} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    残り{item.count}{item.place ? `・${item.place}` : ''}
                  </p>
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
          <p className="text-xs text-gray-400 mt-1.5">注文するとメールから自動で在庫に入ります</p>
        </div>
      )}

      {st && (
        <a
          href={stockAppUrl(status, st.placeId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5"
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
    </div>
  )
}
