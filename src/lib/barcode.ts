import type { AiFoodResult } from './gemini'

interface OpenFoodFactsProduct {
  product_name?: string
  product_name_ja?: string
  nutriments?: {
    'energy-kcal_100g'?: number
    'proteins_100g'?: number
    'fat_100g'?: number
    'carbohydrates_100g'?: number
    'fiber_100g'?: number
    'vitamin-a_100g'?: number
    'vitamin-c_100g'?: number
    'vitamin-d_100g'?: number
    'calcium_100g'?: number
    'iron_100g'?: number
    'sodium_100g'?: number
  }
  serving_size?: string
  serving_quantity?: number
  product_quantity?: number
}

function parseServingGrams(product: OpenFoodFactsProduct): number {
  if (product.serving_quantity && product.serving_quantity > 0) return product.serving_quantity
  if (product.serving_size) {
    const m = product.serving_size.match(/(\d+(\.\d+)?)\s*(g|ml|mL)/i)
    if (m) return parseFloat(m[1])
  }
  if (product.product_quantity && product.product_quantity > 0) return product.product_quantity
  return 100
}

export class BarcodeNotFoundError extends Error {
  barcode: string
  constructor(barcode: string) {
    super('バーコードに対応する商品が見つかりませんでした')
    this.name = 'BarcodeNotFoundError'
    this.barcode = barcode
  }
}

// base64 文字列を Blob に変換
function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type: mimeType })
}

export async function submitToOpenFoodFacts(
  barcode: string,
  result: AiFoodResult,
  per100g: Per100g,
  labelBase64?: string,       // 栄養成分ラベル画像（base64）
  labelMimeType?: string,
): Promise<void> {
  // ① 商品情報・栄養素を登録
  const form = new FormData()
  form.append('code', barcode)
  form.append('product_name', result.name)
  form.append('product_name_ja', result.name)
  form.append('lang', 'ja')
  form.append('lc', 'ja')
  form.append('serving_size', `${result.grams}g`)
  form.append('nutriment_energy-kcal', String(per100g.calories))
  form.append('nutriment_energy-kcal_unit', 'kcal')
  form.append('nutriment_proteins', String(per100g.protein))
  form.append('nutriment_proteins_unit', 'g')
  form.append('nutriment_fat', String(per100g.fat))
  form.append('nutriment_fat_unit', 'g')
  form.append('nutriment_carbohydrates', String(per100g.carbs))
  form.append('nutriment_carbohydrates_unit', 'g')
  form.append('nutriment_fiber', String(per100g.fiber))
  form.append('nutriment_fiber_unit', 'g')
  form.append('nutriment_sodium', String(per100g.na / 1000))
  form.append('nutriment_sodium_unit', 'g')
  form.append('app_name', 'fitlog')
  form.append('app_version', '1.0')

  await fetch('https://world.openfoodfacts.org/cgi/product_jqm2.pl', {
    method: 'POST',
    headers: { 'User-Agent': 'fitlog/1.0' },
    body: form,
  })

  // ② 栄養成分ラベル画像をアップロード（撮影した写真を nutrition_ja として登録）
  if (labelBase64 && labelMimeType) {
    const ext = labelMimeType.includes('png') ? 'png' : 'jpg'
    const blob = base64ToBlob(labelBase64, labelMimeType)
    const imgForm = new FormData()
    imgForm.append('code', barcode)
    imgForm.append('imagefield', 'nutrition_ja')
    imgForm.append('imgupload_nutrition_ja', blob, `nutrition.${ext}`)
    imgForm.append('app_name', 'fitlog')
    imgForm.append('app_version', '1.0')

    await fetch('https://world.openfoodfacts.org/cgi/product_image_upload.pl', {
      method: 'POST',
      headers: { 'User-Agent': 'fitlog/1.0' },
      body: imgForm,
    })
  }
}

// 100g あたりの栄養素（Open Food Facts 投稿用）
export interface Per100g {
  calories: number
  protein: number
  fat: number
  carbs: number
  fiber: number
  na: number
}

export function toPer100g(result: AiFoodResult): Per100g {
  const f = result.grams > 0 ? 100 / result.grams : 1
  const r1 = (v: number) => Math.round(v * f * 10) / 10
  return {
    calories: Math.round(result.calories * f),
    protein:  r1(result.protein),
    fat:      r1(result.fat),
    carbs:    r1(result.carbs),
    fiber:    r1(result.fiber),
    na:       Math.round(result.na * f),
  }
}

export async function lookupBarcode(barcode: string): Promise<AiFoodResult> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
    { headers: { 'User-Agent': 'fitlog/1.0' } }
  )
  if (!res.ok) throw new Error(`通信エラー (${res.status})`)
  const data = await res.json() as { status: number; product?: OpenFoodFactsProduct }
  if (data.status !== 1 || !data.product) throw new BarcodeNotFoundError(barcode)

  const p = data.product
  const name = p.product_name_ja || p.product_name || `商品 (${barcode})`
  const n = p.nutriments ?? {}
  const grams = parseServingGrams(p)
  const factor = grams / 100

  const round1 = (v: number) => Math.round(v * 10) / 10

  return {
    name,
    grams,
    calories: Math.round((n['energy-kcal_100g'] ?? 0) * factor),
    protein:  round1((n['proteins_100g'] ?? 0) * factor),
    fat:      round1((n['fat_100g'] ?? 0) * factor),
    carbs:    round1((n['carbohydrates_100g'] ?? 0) * factor),
    fiber:    round1((n['fiber_100g'] ?? 0) * factor),
    vitA:     Math.round((n['vitamin-a_100g'] ?? 0) * factor * 1000),
    vitC:     Math.round((n['vitamin-c_100g'] ?? 0) * factor * 1000),
    vitD:     round1((n['vitamin-d_100g'] ?? 0) * factor * 1000000),
    ca:       Math.round((n['calcium_100g'] ?? 0) * factor * 1000),
    fe:       round1((n['iron_100g'] ?? 0) * factor * 1000),
    na:       Math.round((n['sodium_100g'] ?? 0) * factor * 1000),
  }
}
