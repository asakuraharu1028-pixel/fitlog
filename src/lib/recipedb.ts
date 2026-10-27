import { create } from 'zustand'
import { loadFileFromDrive, saveFileToDrive } from './google'
import { fetchNotionRecipes, isRecipeProxyConfigured } from './recipeproxy'
import type { Recipe, RecipeDB, RecipeCategory } from '../types'

const FILE_NAME = 'recipe-db.json'
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
  isNotionRecipe: (id: string) => boolean
  getByCategory: (category: RecipeCategory) => Recipe[]
}

export const useRecipeStore = create<RecipeStore>((set, get) => {
  // recipe-db.json を書き換えて保存する。Notion のレシピはここでは変えられない
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

  function rejectNotionEdit(id: string): boolean {
    if (!get().isNotionRecipe(id)) return false
    set({ error: 'Notion のレシピはアプリから編集できません。Notion で編集してください' })
    return true
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
      if (rejectNotionEdit(id)) return
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
      if (rejectNotionEdit(id)) return
      const { localDB } = get()
      await saveLocal({ ...localDB, recipes: localDB.recipes.filter(r => r.id !== id) })
    },

    isNotionRecipe: (id) => get().notionRecipes.some(r => r.id === id),

    getByCategory: (category) =>
      get().db.recipes.filter(r => r.category === category),
  }
})
