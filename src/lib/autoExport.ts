import type { AppData } from '../types'
import { buildCSV, csvFileName, CSV_KINDS } from './csvExport'
import { ensureMyDriveFolder, listFileNamesInFolder, uploadCsvToFolder } from './google'
import { localDateStr } from './utils'

/** マイドライブの書き出し先フォルダ名 */
export const AUTO_EXPORT_FOLDER = 'FitLog_CSV'

let running = false

/**
 * 毎月1回、全期間の CSV をマイドライブの FitLog_CSV フォルダに書き出す。
 * ファイル名は `YYYY-MM-DD_fitlog_<種類>.csv`。
 * その月のファイルがすでにフォルダにあれば書き出さない（Web と Android で二重に出さないため、
 * 判定は端末ではなく Drive の中身で行う）。種類ごとに判定するので、途中で失敗しても次回に残りを出す。
 */
export async function autoExportMonthlyCSV(data: AppData): Promise<void> {
  if (running) return
  running = true
  try {
    const today = localDateStr()
    const monthPrefix = today.slice(0, 7) + '-' // 例: 2026-12-
    const folderId = await ensureMyDriveFolder(AUTO_EXPORT_FOLDER)
    const existing = await listFileNamesInFolder(folderId, monthPrefix)

    for (const kind of CSV_KINDS) {
      const suffix = '_' + csvFileName(kind)
      if (existing.some((name) => name.endsWith(suffix))) continue
      await uploadCsvToFolder(folderId, today + suffix, buildCSV(kind, data))
    }
  } finally {
    running = false
  }
}
