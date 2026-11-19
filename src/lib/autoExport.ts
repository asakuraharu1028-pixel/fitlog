import type { AppData } from '../types'
import { buildCSV, csvFileName, CSV_KINDS } from './csvExport'
import {
  ensureMyDriveFolder,
  listFileNamesInFolder,
  loadFileFromDrive,
  saveFileToDrive,
  uploadCsvToFolder,
} from './google'
import { localDateStr } from './utils'

/** マイドライブの書き出し先フォルダ名 */
export const AUTO_EXPORT_FOLDER = 'FitLog_CSV'

/** どの月まで書き出したかの記録（appDataFolder。Web と Android で共通） */
const STATE_FILE = 'csv-export-state.json'

/** 開かなかった月をさかのぼって書き出す上限 */
const MAX_BACKFILL_MONTHS = 12

interface ExportState {
  /** 書き出しが済んだいちばん新しい月（'YYYY-MM'） */
  lastExportedMonth: string
}

let running = false

/** 'YYYY-MM' に n か月足す（n は負でもよい） */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/**
 * 書き出す月の一覧（古い順）。前月までで、まだ書き出していない月。
 * 開かなかった月があれば MAX_BACKFILL_MONTHS か月までさかのぼる
 */
export function monthsToExport(today: string, lastExportedMonth: string): string[] {
  const prev = addMonths(today.slice(0, 7), -1)
  const months: string[] = []
  for (let m = addMonths(lastExportedMonth, 1); m <= prev; m = addMonths(m, 1)) months.push(m)
  return months.slice(-MAX_BACKFILL_MONTHS)
}

/**
 * 月が変わってから初めて開いたときに、前月分の CSV をマイドライブの FitLog_CSV フォルダに書き出す。
 * ファイル名は `YYYY-MM_fitlog_<種類>.csv`（YYYY-MM は中身の月）。
 * 書き出し済みかどうかは FitLog_CSV の中身ではなく appDataFolder の記録で判断するので、
 * 書き出した CSV を PC 側で別の場所へ移しても、もう一度書き出すことはない。
 * 途中で失敗したら記録を進めず、次に開いたときに残りを出す（FitLog_CSV に同じ名前があれば出さない）。
 */
export async function autoExportMonthlyCSV(data: AppData): Promise<void> {
  if (running) return
  running = true
  try {
    const today = localDateStr()
    const state = await loadFileFromDrive<ExportState>(STATE_FILE)
    if (!state?.lastExportedMonth) {
      // 記録がないとき（この仕組みに切り替えた直後・初めて使うとき）は、前月までを書き出し済みとして記録だけする。
      // 前月分は、それまでの全期間の書き出しで渡しているため。次の月初めから前月分を出す
      await saveFileToDrive<ExportState>(STATE_FILE, { lastExportedMonth: addMonths(today.slice(0, 7), -1) })
      return
    }
    const months = monthsToExport(today, state.lastExportedMonth)
    if (months.length === 0) return

    const folderId = await ensureMyDriveFolder(AUTO_EXPORT_FOLDER)
    for (const month of months) {
      const existing = await listFileNamesInFolder(folderId, month + '_')
      for (const kind of CSV_KINDS) {
        const name = `${month}_${csvFileName(kind)}`
        if (existing.includes(name)) continue
        await uploadCsvToFolder(folderId, name, buildCSV(kind, data, month))
      }
      await saveFileToDrive<ExportState>(STATE_FILE, { lastExportedMonth: month })
    }
  } finally {
    running = false
  }
}
