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

export interface AppData {
  bodyRecords: BodyRecord[]
  mealLogs: MealLog[]
  cardioLogs: CardioLog[]
  strengthLogs: StrengthLog[]
  sleepLogs: SleepLog[]
  settings: {
    heightCm: number
    goalWeightKg?: number
    goalCalories?: number
  }
}
