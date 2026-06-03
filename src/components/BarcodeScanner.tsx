import { useState } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { X, Camera as CameraIcon, Keyboard } from 'lucide-react'

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const [decoding, setDecoding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState('')
  const [showManual, setShowManual] = useState(false)

  const decodeFromDataUrl = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        // 長辺を 1200px に抑えてリサイズ（ZXing は高解像度で失敗しやすい）
        const MAX = 1200
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)

        const reader = new BrowserMultiFormatReader()
        try {
          const result = reader.decodeFromCanvas(canvas)
          resolve(result.getText())
        } catch {
          reject(new Error('NotFoundException'))
        }
      }
      img.onerror = () => reject(new Error('画像を読み込めませんでした'))
      img.src = dataUrl
    })
  }

  const handleCapture = async () => {
    setError(null)
    setDecoding(true)
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 1200,   // Capacitor 側でもリサイズ
        height: 1200,
        correctOrientation: true,
      })
      if (!photo.dataUrl) throw new Error('画像を取得できませんでした')
      const code = await decodeFromDataUrl(photo.dataUrl)
      onDetected(code)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('dismissed')) {
        // キャンセルは無視
      } else if (msg.includes('NotFoundException') || msg.includes('No MultiFormat')) {
        setError('バーコードを読み取れませんでした。枠内にバーコードだけが映るよう近づけて撮影してください。')
      } else {
        setError(`エラー: ${msg}`)
      }
    } finally {
      setDecoding(false)
    }
  }

  const handleManualSubmit = () => {
    const code = manualInput.trim()
    if (!code) return
    onDetected(code)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-600">バーコードを読み取る</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      <button
        onClick={handleCapture}
        disabled={decoding}
        className="w-full border-2 border-dashed border-purple-200 rounded-xl py-8 flex flex-col items-center gap-2 text-purple-600 hover:bg-purple-50 transition disabled:opacity-50"
      >
        {decoding ? (
          <>
            <div className="w-8 h-8 border-4 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
            <span className="text-sm">バーコードを解析中...</span>
          </>
        ) : (
          <>
            <CameraIcon size={36} />
            <span className="text-sm font-medium">カメラでバーコードを撮影</span>
            <span className="text-xs text-gray-400">バーコード部分だけを写してください</span>
          </>
        )}
      </button>

      {error && (
        <div className="bg-red-50 text-red-500 text-xs rounded-xl px-3 py-2">{error}</div>
      )}

      {!showManual ? (
        <button
          onClick={() => setShowManual(true)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mx-auto"
        >
          <Keyboard size={13} />
          バーコード番号を手入力
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            placeholder="JANコード（例: 4901234567890）"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualInput.trim()}
            className="bg-purple-500 text-white rounded-xl px-4 text-sm font-medium disabled:opacity-40 hover:bg-purple-600 transition"
          >
            検索
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">JAN コード（EAN-13）対応</p>
    </div>
  )
}
