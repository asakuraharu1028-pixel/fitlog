import { Capacitor } from '@capacitor/core'
import { getAccessToken, requestAccessToken } from './google'
import type { Recipe } from '../types'

// Notion の「DB_レシピリスト」を GAS の中継（gas/notion-proxy）経由で読む
const PROXY_URL = import.meta.env.VITE_RECIPE_PROXY_URL as string | undefined

// 中継は栄養値などが未入力だと null を返す
type ProxyRecipe = Omit<Recipe, 'servings' | 'calories' | 'protein' | 'fat' | 'carbs'> & {
  servings: number | null
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
}

type ProxyResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export interface ImportResult {
  id: string                  // 送った Recipe の id
  status: 'created' | 'updated' | 'skipped' | 'failed'
  notionId?: string
  error?: string
}

export function isRecipeProxyConfigured(): boolean {
  return !!PROXY_URL
}

async function callProxy<T>(body: Record<string, unknown>, retry = true): Promise<ProxyResponse<T>> {
  if (!PROXY_URL) throw new Error('VITE_RECIPE_PROXY_URL is not set')
  const token = getAccessToken()
  if (!token) throw new Error('Not authenticated')
  // text/plain で送ると CORS のプリフライトが起きない（GAS は OPTIONS に応えられない）
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, token }),
  })
  if (!res.ok) throw new Error(`Recipe proxy error: ${res.status}`)
  const json = (await res.json()) as ProxyResponse<T>
  if (!json.ok && json.error === 'unauthorized' && retry && !Capacitor.isNativePlatform()) {
    // トークン期限切れ → 再取得してリトライ
    await requestAccessToken()
    return callProxy<T>(body, false)
  }
  return json
}

// 未入力の栄養値は 0、人数は 1 として扱う
function toRecipe(r: ProxyRecipe): Recipe {
  return {
    ...r,
    servings: r.servings ?? 1,
    calories: r.calories ?? 0,
    protein: r.protein ?? 0,
    fat: r.fat ?? 0,
    carbs: r.carbs ?? 0,
  }
}

export async function fetchNotionRecipes(refresh = false): Promise<Recipe[]> {
  const res = await callProxy<{ recipes: ProxyRecipe[] }>({ action: 'listRecipes', refresh })
  if (!res.ok) throw new Error(`Recipe proxy error: ${res.error}`)
  return res.data.recipes.map(toRecipe)
}

// Notion に入れる。同じ料理名があれば空の項目だけ埋める（中継側で判定）
export async function importNotionRecipes(recipes: Recipe[]): Promise<ImportResult[]> {
  const res = await callProxy<{ results: ImportResult[] }>({ action: 'importRecipes', recipes })
  if (!res.ok) throw new Error(`Recipe proxy error: ${res.error}`)
  return res.data.results
}
