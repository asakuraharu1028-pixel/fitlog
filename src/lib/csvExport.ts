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

function bodyCSV(data: AppData): string {
  const rows = [...data.bodyRecords]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => [r.date, r.weight, r.bodyFatPct ?? '', r.bmi ?? ''])
  return toCSV(rows, ['日付', '体重(kg)', '体脂肪率(%)', 'BMI'])
}

function mealCSV(data: AppData): string {
  const rows: (string | number)[][] = []
  ;[...data.mealLogs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((log) => {
      log.entries.forEach((e) => {
        rows.push([log.date, log.mealType, e.foodName, e.grams, e.calories, e.protein, e.fat, e.carbs])
      })
    })
  return toCSV(rows, ['日付', '食事タイプ', '食品名', '量(g)', 'カロリー(kcal)', 'タンパク質(g)', '脂質(g)', '炭水化物(g)'])
}

function exerciseCSV(data: AppData): string {
  const cardioRows = [...data.cardioLogs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => [c.date, '有酸素', c.name, `${c.durationMin}分`, c.caloriesBurned, ''])
  const strengthRows = [...data.strengthLogs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((s) =>
      s.sets.map((set, i) => [s.date, '筋トレ', s.name, `セット${i + 1}`, set.weight, set.reps])
    )
  return toCSV([...cardioRows, ...strengthRows],
    ['日付', '種別', '種目', '時間/セット', '重量/消費kcal', '回数/秒数'])
}

function habitCSV(data: AppData): string {
  const labels = new Map(resolveCareItems(data).map((item) => [item.id, item.label]))
  const rows = [...(data.careLogs ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((l) => [
      l.date,
      labels.get(l.itemId) ?? l.itemId,
      l.level === 'full' ? 'しっかり' : '最低ライン',
    ])
  return toCSV(rows, ['日付', '習慣', '実施レベル'])
}

/** 全期間のデータから CSV の中身（BOM つき）を作る */
export function buildCSV(kind: CsvKind, data: AppData): string {
  switch (kind) {
    case 'body': return bodyCSV(data)
    case 'meal': return mealCSV(data)
    case 'exercise': return exerciseCSV(data)
    case 'habit': return habitCSV(data)
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
