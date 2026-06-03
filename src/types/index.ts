export interface BodyRecord {
  id: string
  date: string // YYYY-MM-DD
  weight: number // kg
  bodyFatPct?: number // %
  bmi?: number
}

export interface FoodItem {
  id: string
  name: string
  per100g: {
    calories: number
    protein: number
    fat: number
    carbs: number
    fiber?: number
    vitamins?: Record<string, number>
    minerals?: Record<string, number>
  }
}

export interface FoodEntry {
  foodId: string
  foodName: string
  grams: number
  calories: number
  protein: number
  fat: number
  carbs: number
  sodium?: number // ナトリウム mg
}

export interface MealLog {
  id: string
  date: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  entries: FoodEntry[]
}

export interface CardioLog {
  id: string
  date: string
  name: string
  durationMin: number
  met: number
  caloriesBurned: number
}

export interface StrengthSet {
  weight: number // kg (0 for bodyweight)
  reps: number
}

export interface StrengthLog {
  id: string
  date: string
  name: string
  sets: StrengthSet[]
  estimatedCalories?: number
}

export interface SleepLog {
  id: string
  date: string       // YYYY-MM-DD（就寝日）
  startTime: string  // ISO8601
  endTime: string    // ISO8601
  durationMin: number
}

export interface StepLog {
  date: string   // YYYY-MM-DD
  steps: number
}

export type DietPolicy = 'meal' | 'balance' | 'exercise'

export interface AppData {
  bodyRecords: BodyRecord[]
  mealLogs: MealLog[]
  cardioLogs: CardioLog[]
  strengthLogs: StrengthLog[]
  sleepLogs: SleepLog[]
  stepLogs: StepLog[]
  settings: {
    heightCm: number
    goalWeightKg?: number
    /** 目標摂取カロリー（自動計算して保存） */
    goalCalories?: number
    /** 目標消費（運動）カロリー（自動計算して保存） */
    goalBurnCalories?: number
    /** 基礎代謝 kcal（手動入力） */
    bmr?: number
    /** 目標達成期間（ヶ月） */
    goalMonths?: number
    /** ダイエット方針 */
    dietPolicy?: DietPolicy
    advisorCharacter?: 'default' | 'kenmochi' | 'gaku' | 'togabito'
  }
}
