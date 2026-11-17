import { useEffect, useRef } from 'react'

// USB / Bluetooth のバーコードリーダー（キーボードとして数字＋Enter を打ち込むもの）の読み取りを受け取る。
// 人の手打ちと区別するため、キーの間隔が短い（GAP_MS 以内）ときだけ1つの読み取りとしてまとめる。
// 入力欄・テキストエリアにフォーカスがあるときは、その欄への入力として扱い、横取りしない。
// IME がオンだと数字が届かないため、リーダーを使うときは半角英数にしておく。

const GAP_MS = 80
const JAN_RE = /^\d{8,14}$/

/** 全角数字・空白・ハイフンを直して JAN コードにする。JAN でなければ null */
export function toJan(s: string): string | null {
  const c = s.normalize('NFKC').replace(/[\s\-ー]/g, '')
  return JAN_RE.test(c) ? c : null
}

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
    || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((t as HTMLInputElement).type))
}

export function useBarcodeReader(onScan: (jan: string) => void, enabled = true) {
  const cb = useRef(onScan)
  useEffect(() => { cb.current = onScan }, [onScan])

  useEffect(() => {
    if (!enabled) return
    let buf = ''
    let last = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) { buf = ''; return }
      const now = performance.now()
      if (now - last > GAP_MS) buf = ''
      last = now
      if (e.key === 'Enter') {
        const jan = toJan(buf)
        buf = ''
        if (jan) { e.preventDefault(); cb.current(jan) }
        return
      }
      if (e.key.length === 1) buf += e.key
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled])
}
