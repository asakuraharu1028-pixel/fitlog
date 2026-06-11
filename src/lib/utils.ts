/** ローカル時刻で YYYY-MM-DD を返す（toISOString は UTC のため日本では午前9時まで前日になる） */
export function localDateStr(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 睡眠レコードの起床日（endTime のローカル日付）を返す */
export function sleepWakeDate(s: { endTime: string }): string {
  return localDateStr(new Date(s.endTime))
}
