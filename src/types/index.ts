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
  skipped?: boolean // 食べなかった
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

export type RecipeCategory = 'main' | 'side' | 'soup' | 'staple' | 'breakfast' | 'snack'

export interface RecipeIngredient {
  name: string    // 食材名
  amount: string  // 量（例: "200g", "大さじ1", "1個"）
}

export interface Recipe {
  id: string
  name: string
  category: RecipeCategory
  tags: string[]              // 例: ['高タンパク', '低脂質']
  servings: number            // 何人前
  calories: number            // 1人前
  protein: number
  fat: number
  carbs: number
  sodium?: number             // 食塩相当量 g（1人前）
  ingredients?: RecipeIngredient[]  // 材料リスト
  note?: string
  sourceUrl?: string
  createdAt: string           // ISO8601
  updatedAt: string           // ISO8601
}

export interface RecipeDB {
  version: 1
  recipes: Recipe[]
}

export interface AdviceLog {
  id: string
  date: string       // YYYY-MM-DD
  createdAt: string  // ISO8601
  daily: string
  weekly: string
}

export type DietPolicy = 'meal' | 'balance' | 'exercise'

export interface MealPlanDish {
  name: string
  calories: number
  protein: number
  fat: number
  carbs: number
  sodium?: number | null  // 食塩相当量 g
  searchUrl?: string | null
  note?: string | null
}

export interface DinnerPlan {
  main: MealPlanDish
  staple: MealPlanDish
  sides: MealPlanDish[]
  soup?: MealPlanDish | null
}

export interface DayMealPlan {
  dayLabel: string
  breakfast: MealPlanDish[]
  lunch: MealPlanDish[]
  dinner: DinnerPlan
  snack?: MealPlanDish[]
  totalCalories: number
}

export interface WeeklyMealPlan {
  id: string
  createdAt: string
  goalCalories: number
  days: DayMealPlan[]
}

export type IngredientCategory =
  | '肉類'
  | '魚介類'
  | '野菜'
  | 'きのこ類'
  | '豆腐・大豆'
  | '卵・乳製品'
  | '穀物・麺類'
  | '調味料・油'
  | 'その他'

export interface ShoppingIngredient {
  name: string
  amount: string
  category: IngredientCategory
  fromRecipe: string   // どの料理由来か
  note?: string        // 括弧内の備考（例: "皮なし"、"下味用"）
}

export interface ShoppingCategoryGroup {
  category: IngredientCategory
  items: ShoppingIngredient[]
}

export interface ShoppingListData {
  dbList: ShoppingCategoryGroup[]     // DBレシピ由来
  otherList: ShoppingCategoryGroup[]  // DB未登録料理由来
  generatedAt: string
}

export interface TemplateFoodItem {
  id: string
  name: string
  grams: number
  calories: number
  protein: number
  fat: number
  carbs: number
  sodium?: number
  shop?: string
  jan?: string // JANコード（バーコード）
}

export interface PeriodLog {
  id: string
  startDate: string   // YYYY-MM-DD（生理開始日）
  endDate?: string    // YYYY-MM-DD（生理終了日、任意）
  notes?: string
}

export interface AppData {
  bodyRecords: BodyRecord[]
  mealLogs: MealLog[]
  templateFoods?: TemplateFoodItem[]
  cardioLogs: CardioLog[]
  strengthLogs: StrengthLog[]
  sleepLogs: SleepLog[]
  stepLogs: StepLog[]
  adviceLogs: AdviceLog[]
  periodLogs?: PeriodLog[]
  settings: {
    heightCm: number
    /** 性別 */
    gender?: 'male' | 'female'
    /** 年齢 */
    age?: number
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
