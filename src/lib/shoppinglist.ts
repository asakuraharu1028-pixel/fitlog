import { loadFileFromDrive, saveFileToDrive } from './google'
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
// 括弧・空白・記号を除いた正規化名で比較
function normalizeForMatch(name: string): string {
  return name
    .trim()
    .replace(/[\s　]/g, '')                  // 空白除去
    .replace(/[（(][^）)]*[）)]/g, '')        // 括弧と中身を除去: 「鶏もも肉（皮なし）」→「鶏もも肉」
    .replace(/[・＆&～〜\-－]/g, '')           // 区切り記号除去
}

function matchToRecipe(dishName: string, recipes: Recipe[]): Recipe | null {
  const norm = normalizeForMatch(dishName)
  return (
    // 1. 完全一致
    recipes.find(r => r.name === dishName) ??
    // 2. 正規化後完全一致
    recipes.find(r => normalizeForMatch(r.name) === norm) ??
    // 3. 正規化後部分一致（短い方が長い方に含まれる）
    recipes.find(r => {
      const rn = normalizeForMatch(r.name)
      return norm.includes(rn) || rn.includes(norm)
    }) ??
    null
  )
}


// ── 数量の合算 ───────────────────────────────────────────────
// "200g" → { num: 200, unit: "g" }  "大さじ1と1/3" → { num: 4/3, unit: "大さじ" }
function parseAmount(amount: string): { num: number; unit: string } | null {
  const s = amount.trim()
  // "大さじ1と1/3" / "小さじ1と1/2" などの混合分数
  const mixed = s.match(/^([大小]さじ|カップ)(\d+)と(\d+)\/(\d+)$/)
  if (mixed) {
    const num = parseFloat(mixed[2]) + parseFloat(mixed[3]) / parseFloat(mixed[4])
    return { num, unit: mixed[1] }
  }
  // 通常: (prefix)(整数or小数)(/ 分母)(suffix)
  const m = s.match(/^([大小]さじ|カップ)?(\d+(?:\.\d+)?)(?:\/(\d+))?\s*(.*)$/)
  if (!m) return null
  const prefix = m[1] ?? ''
  const num    = parseFloat(m[2]) / (m[3] ? parseFloat(m[3]) : 1)
  const suffix = m[4].trim()
  const unit   = prefix || suffix
  return { num, unit }
}

// 大さじ/小さじ → 小さじ換算 (大さじ1=小さじ3)
// ml + 大さじ/小さじ → ml換算 (大さじ1=15ml, 小さじ1=5ml)
const UNIT_TO_SMALL_SPOON: Record<string, number> = { '大さじ': 3, '小さじ': 1 }
const UNIT_TO_ML: Record<string, number> = { '大さじ': 15, '小さじ': 5, 'ml': 1, 'cc': 1, '㎖': 1 }
const SPOON_UNITS = new Set(['大さじ', '小さじ'])
const ML_UNITS    = new Set(['ml', 'cc', '㎖', '大さじ', '小さじ'])

function formatNum(n: number): string {
  // 分数表現に変換 (12分の1単位で丸め)
  const rounded = Math.round(n * 12) / 12
  const intPart  = Math.floor(rounded)
  const fracPart = rounded - intPart
  const fracs: [number, string][] = [
    [1/6,'1/6'], [1/4,'1/4'], [1/3,'1/3'], [1/2,'1/2'],
    [2/3,'2/3'], [3/4,'3/4'],
  ]
  for (const [val, str] of fracs) {
    if (Math.abs(fracPart - val) < 0.02) {
      return intPart > 0 ? `${intPart}と${str}` : str
    }
  }
  if (fracPart < 0.02) return String(intPart)
  return String(Math.round(n * 10) / 10)
}

function mergeAmounts(amounts: string[]): string {
  const deduped = [...new Set(amounts.map(a => a.trim()).filter(Boolean))]
  if (deduped.length === 1) return deduped[0]

  // 各amountをパース
  const parsed = deduped.map(a => ({ raw: a, p: parseAmount(a) }))
  const parseable   = parsed.filter(x => x.p !== null) as { raw: string; p: NonNullable<ReturnType<typeof parseAmount>> }[]
  const unparseable = [...new Set(parsed.filter(x => x.p === null).map(x => x.raw))]

  if (parseable.length === 0) return deduped.join(' ＋ ')

  const units = new Set(parseable.map(x => x.p.unit))

  // ① 同一単位 → そのまま合計
  if (units.size === 1) {
    const total = parseable.reduce((s, x) => s + x.p.num, 0)
    const parts = [formatNum(total) + [...units][0], ...unparseable]
    return parts.join(' ＋ ')
  }

  // ② 大さじ＋小さじ混在 → 小さじに統一して合計
  const hasOnlySpoons = [...units].every(u => SPOON_UNITS.has(u))
  if (hasOnlySpoons) {
    const total = parseable.reduce((s, x) => s + x.p.num * (UNIT_TO_SMALL_SPOON[x.p.unit] ?? 1), 0)
    const parts = [formatNum(total) + '小さじ', ...unparseable]
    return parts.join(' ＋ ')
  }

  // ③ ml系（ml/cc/大さじ/小さじ）が混在 → mlに統一して合計
  const allMlCompatible = [...units].every(u => ML_UNITS.has(u))
  if (allMlCompatible) {
    const total = parseable.reduce((s, x) => s + x.p.num * (UNIT_TO_ML[x.p.unit] ?? 1), 0)
    const parts = [formatNum(total) + 'ml', ...unparseable]
    return parts.join(' ＋ ')
  }

  // ④ 単位が異なる → ユニットごとに合計してから連結
  const unitMap = new Map<string, number>()
  for (const x of parseable) {
    unitMap.set(x.p.unit, (unitMap.get(x.p.unit) ?? 0) + x.p.num)
  }
  const parts = [...unitMap.entries()].map(([u, n]) => formatNum(n) + u)
  return [...parts, ...unparseable].join(' ＋ ')
}

// ── 食材名の正規化 ───────────────────────────────────────────
function normalizeIngredient(rawName: string, rawAmount: string): { name: string; amount: string } {
  let name   = rawName.trim()
  let amount = rawAmount.trim()

  // Step 1: グループ記号を除去
  //   "Aしょうゆ:"  "Bサラダ油:" → コロン付き大文字1字
  name = name.replace(/^[A-Z]\s*[:：]\s*/u, '')
  //   "A塩" "B砂糖" → コロンなし・直後が日本語文字
  name = name.replace(/^[A-Z](?=[ぁ-んァ-ン一-龥])/u, '')
  //   "【A】材料" "[合わせ調味料]"
  name = name.replace(/^【[^】]*】\s*/u, '').replace(/^\[[^\]]*\]\s*/u, '')

  // Step 2: 壊れた括弧 "(数値" + "単位)" を修復 → 重量換算は不要なので除去
  //   "油: 小さじ1/4 (1"  + "g)"  →  "油: 小さじ1/4"  + ""
  const brokenBracket = name.match(/^(.*?)\s*\([\d./]+\s*$/)
  if (brokenBracket && /^[a-zA-Zg㎖cc]+\)/.test(amount)) {
    name   = brokenBracket[1]
    amount = ''
  }

  // Step 3: "食材名: 量" または "食材名 量" 形式の分離
  //   "しょうゆ: 小さじ1と1/3"  →  name="しょうゆ"  amount="小さじ1と1/3"
  //   "牛乳: 100ml"             →  name="牛乳"       amount="100ml"
  const withColon = name.match(/^([^\d：:]+?)\s*[:：]\s*(.+)$/)
  if (withColon) {
    name = withColon[1].trim()
    const afterColon = withColon[2].trim()
    if (!amount) {
      amount = afterColon
    } else if (/^\d/.test(afterColon) && /^[^\d]/.test(amount)) {
      // "牛乳: 100" + "ml" → amount="100ml"
      amount = afterColon + amount
    }
  }

  // Step 4: 末尾の余分なコロンを除去
  name = name.replace(/[:：]+$/, '').trim()

  return { name, amount }
}

// ── 同カテゴリ内で同名食材をまとめる ─────────────────────────
function mergeIngredients(ingredients: ShoppingIngredient[]): ShoppingIngredient[] {
  // まず名前を正規化してから key にする
  const normalized = ingredients.map(item => {
    const { name, amount } = normalizeIngredient(item.name, item.amount)
    return { ...item, name, amount }
  })

  const map = new Map<string, { amounts: string[]; fromRecipes: string[] }>()
  for (const item of normalized) {
    const key  = item.name
    const prev = map.get(key) ?? { amounts: [], fromRecipes: [] }
    prev.amounts.push(item.amount)
    if (!prev.fromRecipes.includes(item.fromRecipe)) prev.fromRecipes.push(item.fromRecipe)
    map.set(key, prev)
  }
  return [...map.entries()].map(([name, { amounts, fromRecipes }]) => ({
    name,
    amount:     mergeAmounts(amounts.filter(Boolean)),
    category:   normalized.find(i => i.name === name)!.category,
    fromRecipe: fromRecipes.join('・'),
  }))
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
    .map(cat => ({
      category: cat,
      items: mergeIngredients(map.get(cat)!),
    }))
}

// ── メイン: 買い物リスト生成 ─────────────────────────────────
export async function buildShoppingList(
  plan: WeeklyMealPlan,
  recipes: Recipe[]
): Promise<ShoppingListData> {
  const SKIP_WORDS = ['ご飯', 'ごはん', '白米', 'プロテイン', 'サプリ', '玄米']

  const dishes = collectAllDishes(plan)
  const dbIngredients:  ShoppingIngredient[] = []
  const otherDishNames: string[] = []

  const seen = new Set<string>()
  for (const dish of dishes) {
    if (seen.has(dish.name)) continue
    seen.add(dish.name)
    if (SKIP_WORDS.some(s => dish.name.includes(s))) continue

    const recipe = matchToRecipe(dish.name, recipes)
    if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
      // DBに材料登録あり → そのまま使用
      for (const ing of recipe.ingredients) {
        dbIngredients.push({
          name: ing.name,
          amount: ing.amount,
          category: classifyIngredient(ing.name),
          fromRecipe: dish.name,
        })
      }
    } else {
      // DB未登録（またはマッチしない） → その他へ
      otherDishNames.push(dish.name)
    }
  }

  // DB未登録 = 素材そのもの（ごはん・バナナ・プロテイン等）→ そのまま食材として追加
  const aiIngredients: ShoppingIngredient[] = otherDishNames.map(name => ({
    name,
    amount: '',
    category: classifyIngredient(name),
    fromRecipe: '',
  }))

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
