import { loadFileFromDrive, saveFileToDrive } from './google'
import { getApiKey } from './gemini'
import type {
  WeeklyMealPlan,
  MealPlanDish,
  Recipe,
  IngredientCategory,
  ShoppingIngredient,
  ShoppingCategoryGroup,
  ShoppingListData,
} from '../types'

const SHOPPING_FILE = 'shoppinglist.json'

// ── カテゴリ分類キーワードマップ ─────────────────────────────
const CATEGORY_KEYWORDS: [IngredientCategory, string[]][] = [
  ['肉類',     ['鶏', '豚', '牛', 'ひき肉', 'ベーコン', 'ウインナー', 'ソーセージ', 'レバー', 'ハム', 'スパム', '鶏肉', '豚肉', '牛肉', '合いびき', 'ラム']],
  ['魚介類',   ['鮭', 'サーモン', 'さば', 'まぐろ', 'えび', 'いか', 'あじ', 'たら', 'しらす', 'ツナ', 'かつお', 'ぶり', 'さんま', 'ちりめん', 'たこ', 'あさり', 'しじみ', 'ほたて', '魚', '刺身', '干物']],
  ['野菜',     ['たまねぎ', '玉ねぎ', 'にんじん', 'キャベツ', 'ブロッコリー', 'ほうれん草', 'トマト', 'じゃがいも', '大根', '白菜', 'ねぎ', 'ピーマン', 'なす', 'きゅうり', 'レタス', 'ごぼう', 'れんこん', 'かぼちゃ', 'さつまいも', '小松菜', 'チンゲン菜', 'もやし', 'パプリカ', 'セロリ', 'アスパラ', 'ズッキーニ', 'コーン', '枝豆', 'オクラ', 'にんにく', 'しょうが', '生姜']],
  ['きのこ類', ['しめじ', 'えのき', 'まいたけ', 'しいたけ', 'なめこ', 'エリンギ', 'きのこ', 'マッシュルーム']],
  ['豆腐・大豆', ['豆腐', '油揚げ', '納豆', '豆乳', 'おから', '厚揚げ', '木綿', '絹ごし', 'ひじき', 'わかめ', 'のり', '昆布', 'こんにゃく', 'しらたき']],
  ['卵・乳製品', ['卵', '牛乳', 'チーズ', 'バター', 'ヨーグルト', '生クリーム', 'スキムミルク']],
  ['穀物・麺類', ['ごはん', '米', 'パスタ', 'うどん', 'そば', 'ラーメン', 'パン', '小麦粉', '薄力粉', '強力粉', '片栗粉', 'パン粉', '春雨', 'そうめん', 'ビーフン', 'オートミール']],
  ['調味料・油', ['塩', '砂糖', 'しょうゆ', '醤油', 'みそ', '味噌', 'みりん', '酒', '酢', 'サラダ油', 'ごま油', 'オリーブ油', 'こしょう', 'カレー', 'だし', 'めんつゆ', 'ケチャップ', 'マヨネーズ', 'ソース', 'ポン酢', '豆板醤', 'コチュジャン', 'ナンプラー', 'オイスター', 'ラー油', '白だし', '顆粒', '和風だし', '中華だし', 'コンソメ', 'ドレッシング', 'はちみつ', 'シナモン', 'バニラ', 'ベーキング']],
]

export function classifyIngredient(name: string): IngredientCategory {
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => name.includes(kw))) return category
  }
  return 'その他'
}

// ── 献立から全料理名を収集 ────────────────────────────────────
function collectAllDishes(plan: WeeklyMealPlan): MealPlanDish[] {
  const dishes: MealPlanDish[] = []
  for (const day of plan.days) {
    dishes.push(...day.breakfast, ...day.lunch)
    dishes.push(day.dinner.main, day.dinner.staple, ...day.dinner.sides)
    if (day.dinner.soup) dishes.push(day.dinner.soup)
    if (day.snack) dishes.push(...day.snack)
  }
  return dishes
}

// ── DBレシピとのマッチング ────────────────────────────────────
function matchToRecipe(dishName: string, recipes: Recipe[]): Recipe | null {
  // 完全一致 → 部分一致の順で検索
  return (
    recipes.find(r => r.name === dishName) ??
    recipes.find(r => dishName.includes(r.name) || r.name.includes(dishName)) ??
    null
  )
}

// ── Geminiで未登録料理の材料を取得 ───────────────────────────
async function fetchIngredientsFromAI(
  dishNames: string[]
): Promise<Record<string, { name: string; amount: string }[]>> {
  const apiKey = getApiKey()
  if (!apiKey || dishNames.length === 0) return {}

  const prompt = `以下の料理それぞれについて、一般的な家庭料理レシピの材料リストをJSONで返してください。
料理名: ${dishNames.join('、')}

必ず以下のJSON形式のみで返答してください（コードブロック・説明文不要）:
{"dishes":[{"name":"料理名","ingredients":[{"name":"食材名","amount":"量（例: 200g, 大さじ1, 1個）"}]}]}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })
  if (!res.ok) throw new Error(`APIエラー ${res.status}`)
  const data = await res.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return {}

  const parsed = JSON.parse(match[0]) as {
    dishes: { name: string; ingredients: { name: string; amount: string }[] }[]
  }
  const result: Record<string, { name: string; amount: string }[]> = {}
  for (const d of parsed.dishes) {
    result[d.name] = d.ingredients
  }
  return result
}

// ── カテゴリグループに変換 ───────────────────────────────────
function groupByCategory(ingredients: ShoppingIngredient[]): ShoppingCategoryGroup[] {
  const ORDER: IngredientCategory[] = [
    '肉類', '魚介類', '野菜', 'きのこ類', '豆腐・大豆', '卵・乳製品', '穀物・麺類', '調味料・油', 'その他',
  ]
  const map = new Map<IngredientCategory, ShoppingIngredient[]>()
  for (const item of ingredients) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }
  return ORDER
    .filter(cat => map.has(cat))
    .map(cat => ({ category: cat, items: map.get(cat)! }))
}

// ── メイン: 買い物リスト生成 ─────────────────────────────────
export async function buildShoppingList(
  plan: WeeklyMealPlan,
  recipes: Recipe[]
): Promise<ShoppingListData> {
  const dishes = collectAllDishes(plan)
  const dbIngredients: ShoppingIngredient[] = []
  const otherDishNames: string[] = []

  // DBマッチング
  const seen = new Set<string>()  // 同名料理の重複処理
  for (const dish of dishes) {
    if (seen.has(dish.name)) continue
    seen.add(dish.name)

    const recipe = matchToRecipe(dish.name, recipes)
    if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
      for (const ing of recipe.ingredients) {
        dbIngredients.push({
          name: ing.name,
          amount: ing.amount,
          category: classifyIngredient(ing.name),
          fromRecipe: dish.name,
        })
      }
    } else {
      // 主食・サプリなど材料不要なものはスキップ
      const skip = ['ご飯', 'ごはん', '白米', 'プロテイン', 'サプリ']
      if (!skip.some(s => dish.name.includes(s))) {
        otherDishNames.push(dish.name)
      }
    }
  }

  // DB未登録料理の材料をAIで取得
  const aiIngredients: ShoppingIngredient[] = []
  if (otherDishNames.length > 0) {
    const aiResult = await fetchIngredientsFromAI(otherDishNames)
    for (const [dishName, ings] of Object.entries(aiResult)) {
      for (const ing of ings) {
        aiIngredients.push({
          name: ing.name,
          amount: ing.amount,
          category: classifyIngredient(ing.name),
          fromRecipe: dishName,
        })
      }
    }
  }

  const result: ShoppingListData = {
    dbList:    groupByCategory(dbIngredients),
    otherList: groupByCategory(aiIngredients),
    generatedAt: new Date().toISOString(),
  }

  await saveFileToDrive(SHOPPING_FILE, result)
  return result
}

export async function loadShoppingList(): Promise<ShoppingListData | null> {
  try {
    return await loadFileFromDrive<ShoppingListData>(SHOPPING_FILE)
  } catch {
    return null
  }
}
