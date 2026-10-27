import { create } from 'zustand'
import { loadFileFromDrive, saveFileToDrive } from './google'
import {
  fetchNotionRecipes, importNotionRecipes, isRecipeProxyConfigured,
  createNotionRecipe, updateNotionRecipe, deleteNotionRecipe,
} from './recipeproxy'
import type { Recipe, RecipeDB, RecipeCategory, RecipeIngredient } from '../types'

const FILE_NAME = 'recipe-db.json'
const BACKUP_FILE_NAME = 'recipe-db.backup.json'
const IMPORT_CHUNK_SIZE = 20  // GAS の実行時間（6分）に余裕を持たせる
const EMPTY_DB: RecipeDB = { version: 1, recipes: [] }

function isRecipeDB(d: unknown): d is RecipeDB {
  return !!d && typeof d === 'object' && Array.isArray((d as RecipeDB).recipes)
}

function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '')
}

// Notion を正本とし、Notion にない名前のレシピだけ recipe-db.json から足す
// （recipe-db.json の残りは Notion への移行が済むまでの暫定）
function mergeRecipes(notion: Recipe[], local: Recipe[]): RecipeDB {
  const names = new Set(notion.map(r => normalizeName(r.name)))
  return {
    version: 1,
    recipes: [...notion, ...local.filter(r => !names.has(normalizeName(r.name)))],
  }
}

// 以前の登録画面は「豚ロース: 50 g」を name「豚ロース: 50」amount「g」のように切っていたので、
// コロンで分け直す
function fixIngredient(i: RecipeIngredient): RecipeIngredient {
  const m = i.name.match(/^(.+?)\s*[:：]\s*(.*)$/)
  if (!m) return i
  return { name: m[1].trim(), amount: (m[2] + i.amount).trim() }
}

// 同じ料理名が複数あれば1件にまとめる（先のものを優先し、空の項目だけ後のもので埋める）
function groupForImport(recipes: Recipe[]): { recipe: Recipe; ids: string[] }[] {
  const groups = new Map<string, { recipe: Recipe; ids: string[] }>()
  for (const r of recipes) {
    const fixed: Recipe = { ...r, ingredients: r.ingredients?.map(fixIngredient) }
    const key = normalizeName(r.name)
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { recipe: fixed, ids: [r.id] })
      continue
    }
    g.ids.push(r.id)
    const merged = { ...g.recipe } as Record<string, unknown>
    for (const [k, v] of Object.entries(fixed)) {
      const cur = merged[k]
      if (cur === undefined || cur === '' || (Array.isArray(cur) && cur.length === 0)) merged[k] = v
    }
    g.recipe = merged as unknown as Recipe
  }
  return [...groups.values()]
}

export interface MigrationProgress {
  done: number
  total: number
  failed: { name: string; error: string }[]
}

interface RecipeStore {
  db: RecipeDB                // 画面や献立生成が使う、Notion と recipe-db.json を合わせたもの
  localDB: RecipeDB           // recipe-db.json の中身
  notionRecipes: Recipe[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  loadDB: (opts?: { refresh?: boolean }) => Promise<void>
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateRecipe: (id: string, patch: Partial<Omit<Recipe, 'id' | 'createdAt'>>) => Promise<void>
  deleteRecipe: (id: string) => Promise<void>
  migrateToNotion: (onProgress: (p: MigrationProgress) => void) => Promise<MigrationProgress>
  isNotionRecipe: (id: string) => boolean
  getByCategory: (category: RecipeCategory) => Recipe[]
}

export const useRecipeStore = create<RecipeStore>((set, get) => {
  // recipe-db.json を書き換えて保存する（Notion の中継がないときと、移行前のレシピ用）
  async function saveLocal(next: RecipeDB) {
    set({ localDB: next, db: mergeRecipes(get().notionRecipes, next.recipes), isSaving: true, error: null })
    try {
      await saveFileToDrive(FILE_NAME, next)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ isSaving: false })
    }
  }

  // Notion に書き込み、結果で notionRecipes を差し替える
  async function saveNotion(write: (recipes: Recipe[]) => Promise<Recipe[]>) {
    set({ isSaving: true, error: null })
    try {
      const notionRecipes = await write(get().notionRecipes)
      set({ notionRecipes, db: mergeRecipes(notionRecipes, get().localDB.recipes) })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ isSaving: false })
    }
  }

  return {
    db: EMPTY_DB,
    localDB: EMPTY_DB,
    notionRecipes: [],
    isLoading: false,
    isSaving: false,
    error: null,

    loadDB: async (opts) => {
      set({ isLoading: true, error: null })
      const [local, notion] = await Promise.allSettled([
        loadFileFromDrive<RecipeDB>(FILE_NAME),
        isRecipeProxyConfigured() ? fetchNotionRecipes(opts?.refresh) : Promise.resolve(null),
      ])
      const errors: string[] = []
      let localDB = get().localDB
      if (local.status === 'fulfilled') {
        if (local.value && isRecipeDB(local.value)) localDB = local.value
      } else {
        errors.push(local.reason instanceof Error ? local.reason.message : String(local.reason))
      }
      let notionRecipes = get().notionRecipes
      if (notion.status === 'fulfilled') {
        if (notion.value) notionRecipes = notion.value
      } else {
        // 読めなければ前回の Notion の結果をそのまま使う
        errors.push(notion.reason instanceof Error ? notion.reason.message : String(notion.reason))
      }
      set({
        localDB,
        notionRecipes,
        db: mergeRecipes(notionRecipes, localDB.recipes),
        error: errors.length ? errors.join(' / ') : null,
        isLoading: false,
      })
    },

    addRecipe: async (recipe) => {
      if (isRecipeProxyConfigured()) {
        await saveNotion(async recipes => [...recipes, await createNotionRecipe(recipe)])
        return
      }
      const now = new Date().toISOString()
      const newRecipe: Recipe = {
        ...recipe,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      const { localDB } = get()
      await saveLocal({ ...localDB, recipes: [...localDB.recipes, newRecipe] })
    },

    updateRecipe: async (id, patch) => {
      const current = get().notionRecipes.find(r => r.id === id)
      if (current) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, createdAt: _c, updatedAt: _u, ...input } = { ...current, ...patch }
        await saveNotion(async recipes => {
          const updated = await updateNotionRecipe(id, input)
          return recipes.map(r => (r.id === id ? updated : r))
        })
        return
      }
      const now = new Date().toISOString()
      const { localDB } = get()
      await saveLocal({
        ...localDB,
        recipes: localDB.recipes.map(r =>
          r.id === id ? { ...r, ...patch, updatedAt: now } : r
        ),
      })
    },

    deleteRecipe: async (id) => {
      if (get().isNotionRecipe(id)) {
        await saveNotion(async recipes => {
          await deleteNotionRecipe(id)
          return recipes.filter(r => r.id !== id)
        })
        return
      }
      const { localDB } = get()
      await saveLocal({ ...localDB, recipes: localDB.recipes.filter(r => r.id !== id) })
    },

    // recipe-db.json のレシピを Notion に移し、移せたものを recipe-db.json から外す。
    // 最初の1回だけ元の内容を recipe-db.backup.json に残す
    migrateToNotion: async (onProgress) => {
      const { localDB } = get()
      if (!(await loadFileFromDrive<RecipeDB>(BACKUP_FILE_NAME))) {
        await saveFileToDrive(BACKUP_FILE_NAME, localDB)
      }

      const groups = groupForImport(localDB.recipes)
      const progress: MigrationProgress = { done: 0, total: groups.length, failed: [] }
      const migratedIds = new Set<string>()
      onProgress({ ...progress })
      try {
        for (let i = 0; i < groups.length; i += IMPORT_CHUNK_SIZE) {
          const chunk = groups.slice(i, i + IMPORT_CHUNK_SIZE)
          const results = await importNotionRecipes(chunk.map(g => g.recipe))
          const byId = new Map(results.map(r => [r.id, r]))
          for (const g of chunk) {
            const r = byId.get(g.recipe.id)
            if (r && r.status !== 'failed') g.ids.forEach(id => migratedIds.add(id))
            else progress.failed.push({ name: g.recipe.name, error: r?.error ?? 'no result' })
          }
          progress.done += chunk.length
          onProgress({ ...progress, failed: [...progress.failed] })
        }
      } finally {
        // 途中で止まっても、移せた分は recipe-db.json から外す（再実行しても重複はしない）
        if (migratedIds.size > 0) {
          await saveLocal({ ...localDB, recipes: localDB.recipes.filter(r => !migratedIds.has(r.id)) })
        }
        await get().loadDB({ refresh: true })
      }
      return progress
    },

    isNotionRecipe: (id) => get().notionRecipes.some(r => r.id === id),

    getByCategory: (category) =>
      get().db.recipes.filter(r => r.category === category),
  }
})
