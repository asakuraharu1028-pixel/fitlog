import { nanoid } from 'nanoid'
import type { AppData, CardioLog, StrengthLog } from '../types'
import { CARDIO_DB, STRENGTH_DB, calcCardioCalories, calcStrengthCalories } from './exercisedb'

/** ワンタップで記録できる「ちょっとだけ運動」 */
export interface QuickExercise {
  id: string
  icon: string
  label: string
  /** cardio は CARDIO_DB、strength は STRENGTH_DB の id */
  kind: 'cardio' | 'strength'
  exerciseId: string
  /** cardio は分、strength は回数（秒の種目は秒数） */
  amount: number
}

export const QUICK_EXERCISES: QuickExercise[] = [
  { id: 'q_squat',   icon: '🦵', label: 'スクワット10回',   kind: 'strength', exerciseId: 'squat',        amount: 10 },
  { id: 'q_pushup',  icon: '💪', label: '膝つき腕立て10回', kind: 'strength', exerciseId: 'knee_push_up', amount: 10 },
  { id: 'q_plank',   icon: '🧘', label: 'プランク30秒',     kind: 'strength', exerciseId: 'plank',        amount: 30 },
  { id: 'q_stretch', icon: '🙆', label: 'ストレッチ5分',    kind: 'cardio',   exerciseId: 'stretching',   amount: 5 },
  { id: 'q_taiso',   icon: '📻', label: 'ラジオ体操3分',    kind: 'cardio',   exerciseId: 'radio_taiso',  amount: 3 },
  { id: 'q_walk',    icon: '🚶', label: '散歩10分',         kind: 'cardio',   exerciseId: 'walk_normal',  amount: 10 },
]

/** その日に運動（有酸素・筋トレ）の記録があるか */
export function hasExerciseOn(data: AppData, date: string): boolean {
  return data.cardioLogs.some(c => c.date === date) || data.strengthLogs.some(s => s.date === date)
}

/** プリセットから保存用のデータ差分を作る */
export function buildQuickExerciseUpdate(
  q: QuickExercise, data: AppData, date: string,
): Partial<Pick<AppData, 'cardioLogs' | 'strengthLogs'>> {
  const bodyWeight = data.bodyRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? 60

  if (q.kind === 'cardio') {
    const exercise = CARDIO_DB.find(c => c.id === q.exerciseId)!
    const log: CardioLog = {
      id: nanoid(),
      date,
      name: exercise.name,
      durationMin: q.amount,
      met: exercise.met,
      caloriesBurned: calcCardioCalories(exercise.met, bodyWeight, q.amount),
    }
    return { cardioLogs: [...data.cardioLogs, log] }
  }

  const exercise = STRENGTH_DB.find(s => s.id === q.exerciseId)!
  const sets = [{ weight: 0, reps: q.amount }]
  const log: StrengthLog = {
    id: nanoid(),
    date,
    name: exercise.name,
    sets,
    estimatedCalories: calcStrengthCalories(exercise.metPerMin, bodyWeight, sets, exercise.unit === 'seconds'),
  }
  return { strengthLogs: [...data.strengthLogs, log] }
}
