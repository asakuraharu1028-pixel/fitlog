import { create } from 'zustand'
import { loadFileFromDrive, saveFileToDrive } from './google'
import type { Recipe, RecipeDB, RecipeCategory } from '../types'

const FILE_NAME = 'recipe-db.json'
const EMPTY_DB: RecipeDB = { version: 1, recipes: [] }

function isRecipeDB(d: unknown): d is RecipeDB {
  return !!d && typeof d === 'object' && Array.isArray((d as RecipeDB).recipes)
}

interface RecipeStore {
  db: RecipeDB
  isLoading: boolean
  isSaving: boolean
  error: string | null
  loadDB: () => Promise<void>
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateRecipe: (id: string, patch: Partial<Omit<Recipe, 'id' | 'createdAt'>>) => Promise<void>
  deleteRecipe: (id: string) => Promise<void>
  getByCategory: (category: RecipeCategory) => Recipe[]
}

export const useRecipeStore = create<RecipeStore>((set, get) => ({
  db: EMPTY_DB,
  isLoading: false,
  isSaving: false,
  error: null,

  loadDB: async () => {
    set({ isLoading: true, error: null })
    try {
      const remote = await loadFileFromDrive<RecipeDB>(FILE_NAME)
      if (remote && isRecipeDB(remote)) {
        set({ db: remote })
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ isLoading: false })
    }
  },

  addRecipe: async (recipe) => {
    const now = new Date().toISOString()
    const newRecipe: Recipe = {
      ...recipe,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    const next: RecipeDB = {
      ...get().db,
      recipes: [...get().db.recipes, newRecipe],
    }
    set({ db: next, isSaving: true, error: null })
    try {
      await saveFileToDrive(FILE_NAME, next)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ isSaving: false })
    }
  },

  updateRecipe: async (id, patch) => {
    const now = new Date().toISOString()
    const next: RecipeDB = {
      ...get().db,
      recipes: get().db.recipes.map(r =>
        r.id === id ? { ...r, ...patch, updatedAt: now } : r
      ),
    }
    set({ db: next, isSaving: true, error: null })
    try {
      await saveFileToDrive(FILE_NAME, next)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ isSaving: false })
    }
  },

  deleteRecipe: async (id) => {
    const next: RecipeDB = {
      ...get().db,
      recipes: get().db.recipes.filter(r => r.id !== id),
    }
    set({ db: next, isSaving: true, error: null })
    try {
      await saveFileToDrive(FILE_NAME, next)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ isSaving: false })
    }
  },

  getByCategory: (category) =>
    get().db.recipes.filter(r => r.category === category),
}))
