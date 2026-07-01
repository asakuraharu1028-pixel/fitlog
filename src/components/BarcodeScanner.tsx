import { useState } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { X, Camera as CameraIcon, Keyboard } from 'lucide-react'

// @zxing/library はバンドルが大きい（~400KB）。端末内蔵の BarcodeDetector で
// 読めない場合のフォールバックなので、必要になった時だけ動的 import する。
type ZxingModule = typeof import('@zxing/library')
let zxingPromise: Promise<ZxingModule> | null = null
function loadZxing(): Promise<ZxingModule> {
  if (!zxingPromise) zxingPromise = import('@zxing/library')
  return zxingPromise
}

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

// Android WebView / Chrome に組み込みの BarcodeDetector 型定義
interface BarcodeDetectorResult { rawValue: string }
interface BarcodeDetectorAPI {
  detect(image: ImageBitmap): Promise<BarcodeDetectorResult[]>
}
declare const BarcodeDetector: {
  new(opts: { formats: string[] }): BarcodeDetectorAPI
} | undefined

async function decodeWithNativeApi(dataUrl: string): Promise<string | null> {
  if (typeof BarcodeDetector === 'undefined') return null
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'],
    })
    const results = await detector.detect(bitmap)
    return results.length > 0 ? results[0].rawValue : null
  } catch {
    return null
  }
}

function decodeWithZxing(zxing: ZxingModule, canvas: HTMLCanvasElement): string {
  const { MultiFormatReader, BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer, RGBLuminanceSource, DecodeHintType } = zxing
  const { width: w, height: h } = canvas
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, w, h)
  const luminanceSource = new RGBLuminanceSource(imageData.data, w, h)

  const hints = new Map()
  hints.set(DecodeHintType.TRY_HARDER, true)
  const reader = new MultiFormatReader()
  reader.setHints(hints)

  for (const Binarizer of [HybridBinarizer, GlobalHistogramBinarizer]) {
    try {
      const bitmap = new BinaryBitmap(new Binarizer(luminanceSource))
      return reader.decode(bitmap).getText()
    } catch { /* 次へ */ }
  }
  throw new Error('NotFoundException')
}

async function decodeWithZxingFromDataUrl(dataUrl: string): Promise<string> {
  const zxing = await loadZxing()  // 必要になった時点で @zxing を読み込む
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      for (const MAX of [1200, 800, 500]) {
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        try {
          resolve(decodeWithZxing(zxing, canvas))
          return
        } catch { /* 次のスケールへ */ }
      }
      reject(new Error('NotFoundException'))
    }
    img.onerror = () => reject(new Error('画像を読み込めませんでした'))
    img.src = dataUrl
  })
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const [decoding, setDecoding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState('')
  const [showManual, setShowManual] = useState(false)

  const handleCapture = async () => {
    setError(null)
    setDecoding(true)
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 800,
        height: 800,
        correctOrientation: true,
      })
      if (!photo.dataUrl) throw new Error('画像を取得できませんでした')

      // 1. ネイティブ BarcodeDetector（Android WebView組み込み）を優先
      const native = await decodeWithNativeApi(photo.dataUrl)
      if (native) { onDetected(native); return }

      // 2. ZXing フォールバック
      const code = await decodeWithZxingFromDataUrl(photo.dataUrl)
      onDetected(code)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('dismissed')) {
        // キャンセルは無視
      } else if (msg.includes('NotFoundException') || msg.includes('No MultiFormat')) {
        setError('バーコードを読み取れませんでした。バーコードだけを画面いっぱいに写して撮影してください。')
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
            <span className="text-xs text-gray-400">バーコードを画面いっぱいに写してください</span>
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
