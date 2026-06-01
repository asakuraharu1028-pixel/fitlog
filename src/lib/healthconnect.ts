import { registerPlugin } from '@capacitor/core'

interface HealthConnectPlugin {
  checkAvailability(): Promise<{ status: 'available' | 'unavailable' | 'needsUpdate' }>
  checkHCPermissions(): Promise<{ granted: boolean }>
  requestHCPermissions(): Promise<{ granted: boolean }>
  readSteps(opts: { startDate: string; endDate: string }): Promise<{ data: { date: string; steps: number }[] }>
  readWeight(opts: { startDate: string; endDate: string }): Promise<{ data: { date: string; weightKg: number }[] }>
  writeWeight(opts: { date: string; weightKg: number }): Promise<void>
  readBodyFat(opts: { startDate: string; endDate: string }): Promise<{ data: { date: string; bodyFatPct: number }[] }>
  writeBodyFat(opts: { date: string; bodyFatPct: number }): Promise<void>
  readSleep(opts: { startDate: string; endDate: string }): Promise<{ data: SleepRecord[] }>
  writeSleep(opts: { startTime: string; endTime: string }): Promise<void>
}

export interface SleepRecord {
  date: string
  startTime: string
  endTime: string
  durationMin: number
}

const HealthConnect = registerPlugin<HealthConnectPlugin>('HealthConnect')

export async function hcCheckAvailability() {
  try {
    const { status } = await HealthConnect.checkAvailability()
    return status
  } catch {
    return 'unavailable' as const
  }
}

export async function hcCheckPermissions(): Promise<boolean> {
  const { granted } = await HealthConnect.checkHCPermissions()
  return granted
}

export async function hcOpenPermissions(): Promise<boolean> {
  const { granted } = await HealthConnect.requestHCPermissions()
  return granted
}

export async function hcReadSteps(startDate: string, endDate: string) {
  const { data } = await HealthConnect.readSteps({ startDate, endDate })
  return data
}

export async function hcReadWeight(startDate: string, endDate: string) {
  const { data } = await HealthConnect.readWeight({ startDate, endDate })
  return data
}

export async function hcWriteWeight(date: string, weightKg: number) {
  await HealthConnect.writeWeight({ date, weightKg })
}

export async function hcReadBodyFat(startDate: string, endDate: string) {
  const { data } = await HealthConnect.readBodyFat({ startDate, endDate })
  return data
}

export async function hcWriteBodyFat(date: string, bodyFatPct: number) {
  await HealthConnect.writeBodyFat({ date, bodyFatPct })
}

export async function hcReadSleep(startDate: string, endDate: string) {
  const { data } = await HealthConnect.readSleep({ startDate, endDate })
  return data
}

export async function hcWriteSleep(startTime: string, endTime: string) {
  await HealthConnect.writeSleep({ startTime, endTime })
}
