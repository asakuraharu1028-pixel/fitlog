import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { localDateStr } from '../lib/utils'

interface Props {
  date: string
  onChange: (date: string) => void
}

export default function DateSelector({ date, onChange }: Props) {
  const today = localDateStr()

  const shift = (days: number) => {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + days)
    const next = localDateStr(d)
    if (next <= today) onChange(next)
  }

  const label = date === today
    ? '今日'
    : new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-sm">
      <Calendar size={15} className="text-gray-400 shrink-0" />
      <button
        onClick={() => shift(-1)}
        className="p-1 text-gray-400 hover:text-gray-600 transition"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex-1 text-center">
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => { if (e.target.value) onChange(e.target.value) }}
          className="sr-only"
          id="date-selector-input"
        />
        <label
          htmlFor="date-selector-input"
          className={`text-sm font-semibold cursor-pointer ${date === today ? 'text-green-600' : 'text-orange-500'}`}
        >
          {label}
        </label>
      </div>
      <button
        onClick={() => shift(1)}
        disabled={date >= today}
        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
