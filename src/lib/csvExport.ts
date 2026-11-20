import type { AppData } from '../types'
import { resolveCareItems } from './selfcare'

/** 書き出す CSV の種類（ファイル名は `fitlog_<kind>.csv`） */
export type CsvKind = 'body' | 'meal' | 'exercise' | 'habit'

export const CSV_KINDS: CsvKind[] = ['body', 'meal', 'exercise', 'habit']

export function csvFileName(kind: CsvKind): string {
  return `fitlog_${kind}.csv`
}

const BOM = '﻿'

function toCSV(rows: (string | number)[][], headers: string[]) {
  const lines = [headers.join(','), ...rows.map((r) => r.join(','))]
  return BOM + lines.join('\n')
}

/** month（'YYYY-MM'）を指定したら、その月の日付だけを残す。指定なしは全期間 */
function inMonth(date: string, month?: string): boolean {
  return !month || date.startsWith(month + '-')
}

/**
 * 体重・体組成と睡眠時間。睡眠時間はその日（就寝日）の合計（分）。
 * 同じ日に体重の記録が複数あるときは最初の行にだけ入れ、体重を記録していない日は体重の列を空にした行で出す
 */
function bodyCSV(data: AppData, month?: string): string {
  const sleepByDate = new Map<string, number>()
  ;(data.sleepLogs ?? [])
    .filter((s) => inMonth(s.date, month))
    .forEach((s) => sleepByDate.set(s.date, (sleepByDate.get(s.date) ?? 0) + s.durationMin))

  const sleepWritten = new Set<string>()
  const sleepCell = (date: string): number | '' => {
    const min = sleepByDate.get(date)
    if (min === undefined || sleepWritten.has(date)) return ''
    sleepWritten.add(date)
    return Math.round(min)
  }

  const bodyRows = data.bodyRecords
    .filter((r) => inMonth(r.date, month))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => [r.date, r.weight, r.bodyFatPct ?? '', r.bmi ?? '', sleepCell(r.date)])
  const sleepOnlyRows = [...sleepByDate.keys()]
    .filter((date) => !sleepWritten.has(date))
    .map((date) => [date, '', '', '', sleepCell(date)])

  // sort は安定なので、同じ日の中では体重の行の順（睡眠時間を入れた行が先）が保たれる
  const rows = [...bodyRows, ...sleepOnlyRows].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return toCSV(rows, ['日付', '体重(kg)', '体脂肪率(%)', 'BMI', '睡眠時間(分)'])
}

function mealCSV(data: AppData, month?: string): string {
  const rows: (string | number)[][] = []
  data.mealLogs
    .filter((log) => inMonth(log.date, month))
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((log) => {
      log.entries.forEach((e) => {
        rows.push([log.date, log.mealType, e.foodName, e.grams, e.calories, e.protein, e.fat, e.carbs])
      })
    })
  return toCSV(rows, ['日付', '食事タイプ', '食品名', '量(g)', 'カロリー(kcal)', 'タンパク質(g)', '脂質(g)', '炭水化物(g)'])
}

function exerciseCSV(data: AppData, month?: string): string {
  const cardioRows = data.cardioLogs
    .filter((c) => inMonth(c.date, month))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => [c.date, '有酸素', c.name, `${c.durationMin}分`, c.caloriesBurned, ''])
  const strengthRows = data.strengthLogs
    .filter((s) => inMonth(s.date, month))
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((s) =>
      s.sets.map((set, i) => [s.date, '筋トレ', s.name, `セット${i + 1}`, set.weight, set.reps])
    )
  return toCSV([...cardioRows, ...strengthRows],
    ['日付', '種別', '種目', '時間/セット', '重量/消費kcal', '回数/秒数'])
}

function habitCSV(data: AppData, month?: string): string {
  const labels = new Map(resolveCareItems(data).map((item) => [item.id, item.label]))
  const rows = (data.careLogs ?? [])
    .filter((l) => inMonth(l.date, month))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((l) => [
      l.date,
      labels.get(l.itemId) ?? l.itemId,
      l.level === 'full' ? 'しっかり' : '最低ライン',
    ])
  return toCSV(rows, ['日付', '習慣', '実施レベル'])
}

/**
 * CSV の中身（BOM つき）を作る。month（'YYYY-MM'）を渡すとその月の分だけ、渡さなければ全期間。
 * 自動書き出しは前月分、レポート画面の手動出力は全期間
 */
export function buildCSV(kind: CsvKind, data: AppData, month?: string): string {
  switch (kind) {
    case 'body': return bodyCSV(data, month)
    case 'meal': return mealCSV(data, month)
    case 'exercise': return exerciseCSV(data, month)
    case 'habit': return habitCSV(data, month)
  }
}

/** 端末にダウンロードする（レポート画面の手動出力） */
export function downloadCSV(kind: CsvKind, data: AppData) {
  const blob = new Blob([buildCSV(kind, data)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = csvFileName(kind)
  a.click()
  URL.revokeObjectURL(url)
}
