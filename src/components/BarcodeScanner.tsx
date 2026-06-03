import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { X } from 'lucide-react'

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current!,
      (result, err) => {
        if (result) {
          onDetected(result.getText())
        } else if (err && !(err instanceof NotFoundException)) {
          setError('カメラにアクセスできませんでした')
        }
      }
    ).catch(() => setError('カメラにアクセスできませんでした'))

    return () => {
      BrowserMultiFormatReader.releaseAllStreams()
    }
  }, [onDetected])

  return (
    <div className="relative w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-600">バーコードをカメラに向けてください</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      {error ? (
        <div className="bg-red-50 text-red-500 text-sm rounded-xl px-3 py-4 text-center">{error}</div>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video ref={videoRef} className="w-full max-h-52 object-cover" />
          {/* スキャン枠 */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-28 border-2 border-green-400 rounded-lg">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-green-400 rounded-br" />
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center mt-2">
        JAN コード（EAN-13）対応
      </p>
    </div>
  )
}
