/**
 * fitlog レシピ中継
 *
 * Notion の「DB_レシピリスト」を読み、fitlog の Recipe 形式に変換して返す。
 * importRecipes で fitlog の Recipe を Notion に入れる（recipe-db.json からの移行用）。
 * Notion のトークンはスクリプトプロパティに置き、アプリには渡さない。
 *
 * スクリプトプロパティ:
 *   NOTION_TOKEN   Notion インテグレーションのシークレット
 *   RECIPE_DB_ID   DB_レシピリスト のデータベースID
 *   ALLOWED_EMAIL  呼び出しを許可する Google アカウントのメールアドレス
 *
 * 呼び出し（POST, Content-Type: text/plain でプリフライトを避ける）:
 *   { "action": "listRecipes", "token": "<Google アクセストークン>", "refresh": false }
 *   { "action": "importRecipes", "token": "...", "recipes": [<Recipe>...] }
 * 応答:
 *   { "ok": true, "data": { "version": 1, "recipes": [...], "fetchedAt": "..." } }
 *   { "ok": false, "error": "unauthorized" }
 */

const NOTION_VERSION = '2022-06-28'
const RECIPES_CACHE_KEY = 'recipes:v1'
const RECIPES_CACHE_SECONDS = 300
const AUTH_CACHE_SECONDS = 600
// CacheService は1値100KBまで。日本語はUTF-8で3バイトなので文字数で余裕を持って分割する
const CACHE_CHUNK_CHARS = 30000

// Notion のカテゴリー → fitlog の category。上から順に最初に一致したものを使う
const CATEGORY_RULES = [
  ['弁当', 'bento'],
  ['朝食', 'breakfast'],
  ['主菜', 'main'],
  ['お鍋', 'main'],
  ['汁もの', 'soup'],
  ['副菜', 'side'],
  ['ごはん', 'staple'],
  ['丼', 'staple'],
  ['麺類', 'staple'],
  ['パン', 'staple'],
  ['サンドイッチ', 'staple'],
  ['おやつ', 'snack'],
]
const DEFAULT_CATEGORY = 'side'

function doGet() {
  return json_({ ok: true, service: 'fitlog-recipe-proxy' })
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    authorize_(req.token)
    switch (req.action) {
      case 'listRecipes':
        return json_({ ok: true, data: listRecipes_(req.refresh === true) })
      case 'importRecipes':
        return json_({ ok: true, data: importRecipes_(req.recipes) })
      default:
        return json_({ ok: false, error: 'unknown action' })
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) })
  }
}

// ---- 認証 ----

// アプリの Google アクセストークン（drive.appdata スコープ）で Drive の about を呼び、
// 本人のメールアドレスか確かめる。結果はトークンのハッシュをキーに少しだけキャッシュする
function authorize_(token) {
  if (!token || typeof token !== 'string') throw new Error('unauthorized')
  const allowed = prop_('ALLOWED_EMAIL').trim().toLowerCase()
  const cache = CacheService.getScriptCache()
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  const key = 'auth:' + Utilities.base64EncodeWebSafe(digest)
  if (cache.get(key) === allowed) return

  const res = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
    { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
  )
  if (res.getResponseCode() !== 200) throw new Error('unauthorized')
  const user = JSON.parse(res.getContentText()).user || {}
  if (String(user.emailAddress || '').toLowerCase() !== allowed) throw new Error('forbidden')
  cache.put(key, allowed, AUTH_CACHE_SECONDS)
}

// ---- レシピ取得 ----

function listRecipes_(refresh) {
  if (!refresh) {
    const hit = getCachedJson_(RECIPES_CACHE_KEY)
    if (hit) return hit
  }
  const pages = queryDatabase_(prop_('RECIPE_DB_ID'))
  const db = {
    version: 1,
    recipes: pages.filter(p => !p.archived && !p.in_trash).map(toRecipe_),
    fetchedAt: new Date().toISOString(),
  }
  putCachedJson_(RECIPES_CACHE_KEY, db, RECIPES_CACHE_SECONDS)
  return db
}

function queryDatabase_(databaseId) {
  const results = []
  let cursor = undefined
  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const res = notion_('post', '/databases/' + databaseId + '/query', body)
    results.push.apply(results, res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return results
}

function notion_(method, path, body) {
  const res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, {
    method: method,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + prop_('NOTION_TOKEN'),
      'Notion-Version': NOTION_VERSION,
    },
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true,
  })
  const code = res.getResponseCode()
  if (code < 200 || code >= 300) {
    throw new Error('notion ' + code + ': ' + res.getContentText().slice(0, 200))
  }
  return JSON.parse(res.getContentText())
}

// ---- 変換 ----

// Notion のページ1件を fitlog の Recipe 形式にする。
// 栄養値が未登録のものは null のまま返し、扱いはアプリ側に任せる
function toRecipe_(page) {
  const p = page.properties || {}
  const categories = multiSelect_(p['カテゴリー'])
  const tags = []
  if (multiSelect_(p['冷凍可']).indexOf('冷凍可') >= 0) tags.push('冷凍可')
  if (select_(p['下味冷凍']) === '可') tags.push('下味冷凍可')

  const recipe = {
    id: page.id,
    name: plainText_(p['料理名']),
    category: toCategory_(categories),
    tags: tags,
    servings: number_(p['人数']),
    calories: number_(p['kcal']),
    protein: number_(p['たんぱく質']),
    fat: number_(p['脂質']),
    carbs: number_(p['炭水化物']),
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  }
  const sodium = number_(p['食塩相当量'])
  if (sodium !== null) recipe.sodium = sodium
  const ingredients = parseIngredients_(plainText_(p['分量']))
  if (ingredients.length > 0) recipe.ingredients = ingredients
  const note = plainText_(p['メモ'])
  if (note) recipe.note = note
  const url = p['URL'] && p['URL'].url
  if (url) recipe.sourceUrl = url
  const imageFileId = plainText_(p['fitlog画像ID'])
  if (imageFileId) recipe.imageFileId = imageFileId
  return recipe
}

function toCategory_(categories) {
  for (let i = 0; i < CATEGORY_RULES.length; i++) {
    if (categories.indexOf(CATEGORY_RULES[i][0]) >= 0) return CATEGORY_RULES[i][1]
  }
  return DEFAULT_CATEGORY
}

// 「材料名｜量」を1行ずつ。区切りは全角・半角どちらの縦棒でもよい
function parseIngredients_(text) {
  if (!text) return []
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.*?)\s*[｜|]\s*(.*)$/)
    return m ? { name: m[1].trim(), amount: m[2].trim() } : { name: line, amount: '' }
  }).filter(i => i.name)
}

function plainText_(prop) {
  if (!prop) return ''
  const arr = prop.title || prop.rich_text || []
  return arr.map(t => t.plain_text || '').join('')
}

function multiSelect_(prop) {
  return prop && prop.multi_select ? prop.multi_select.map(o => o.name) : []
}

function select_(prop) {
  return prop && prop.select ? prop.select.name : null
}

function number_(prop) {
  return prop && typeof prop.number === 'number' ? prop.number : null
}

// ---- 移行（recipe-db.json → Notion） ----

// fitlog の Recipe を Notion に入れる。同じ料理名のページがあれば空の項目だけ埋め、なければ作る。
// 何度実行しても重複しない。結果は1件ずつ { id, status, notionId?, error? } で返す
function importRecipes_(recipes) {
  if (!Array.isArray(recipes)) throw new Error('recipes must be an array')
  const databaseId = prop_('RECIPE_DB_ID')
  const byName = {}
  queryDatabase_(databaseId).forEach(page => {
    if (page.archived || page.in_trash) return
    const key = normalizeName_(plainText_((page.properties || {})['料理名']))
    if (key && !byName[key]) byName[key] = page
  })

  const results = recipes.map(recipe => {
    try {
      const props = fromRecipe_(recipe)
      const key = normalizeName_(recipe.name)
      const page = byName[key]
      if (!page) {
        const created = notion_('post', '/pages', { parent: { database_id: databaseId }, properties: props })
        byName[key] = created
        return { id: recipe.id, status: 'created', notionId: created.id }
      }
      const patch = {}
      Object.keys(props).forEach(name => {
        if (isEmptyProp_(page.properties[name])) patch[name] = props[name]
      })
      if (Object.keys(patch).length === 0) return { id: recipe.id, status: 'skipped', notionId: page.id }
      notion_('patch', '/pages/' + page.id, { properties: patch })
      return { id: recipe.id, status: 'updated', notionId: page.id }
    } catch (err) {
      const message = String((err && err.message) || err)
      // 権限不足やトークン不正は全件同じ結果になるので止める
      if (/^notion 40[13]/.test(message)) throw err
      return { id: recipe.id, status: 'failed', error: message }
    }
  })
  CacheService.getScriptCache().remove(RECIPES_CACHE_KEY + ':n')
  return { results: results }
}

// Recipe → Notion のプロパティ。値のないものは含めない
function fromRecipe_(r) {
  if (!r || typeof r.name !== 'string' || !r.name.trim()) throw new Error('name is required')
  const props = { '料理名': { title: richText_(r.name.trim()) } }
  props['カテゴリー'] = { multi_select: [{ name: toNotionCategory_(r.category, r.name) }] }

  const tags = Array.isArray(r.tags) ? r.tags : []
  if (tags.indexOf('冷凍可') >= 0) props['冷凍可'] = { multi_select: [{ name: '冷凍可' }] }
  if (tags.indexOf('下味冷凍可') >= 0) props['下味冷凍'] = { select: { name: '可' } }

  const numbers = { '人数': r.servings, 'kcal': r.calories, 'たんぱく質': r.protein, '脂質': r.fat, '炭水化物': r.carbs, '食塩相当量': r.sodium }
  Object.keys(numbers).forEach(name => {
    if (typeof numbers[name] === 'number' && isFinite(numbers[name])) props[name] = { number: numbers[name] }
  })

  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .filter(i => i && i.name)
    .map(i => i.amount ? i.name + '｜' + i.amount : i.name)
  if (ingredients.length) props['分量'] = { rich_text: richText_(ingredients.join('\n')) }

  // Notion に列のないタグはメモに残す
  const otherTags = tags.filter(t => t !== '冷凍可' && t !== '下味冷凍可')
  const note = [r.note || '', otherTags.length ? 'タグ: ' + otherTags.join('、') : ''].filter(Boolean).join('\n')
  if (note) props['メモ'] = { rich_text: richText_(note) }
  if (r.sourceUrl) props['URL'] = { url: r.sourceUrl }
  if (r.imageFileId) props['fitlog画像ID'] = { rich_text: richText_(r.imageFileId) }
  return props
}

// CATEGORY_RULES の逆。主食は料理名から 丼・麺類・ごはん に分ける
function toNotionCategory_(category, name) {
  switch (category) {
    case 'main': return '主菜'
    case 'side': return '副菜'
    case 'soup': return '汁もの'
    case 'breakfast': return '朝食'
    case 'snack': return 'おやつ'
    case 'bento': return '弁当'
    case 'staple':
      if (/丼/.test(name)) return '丼'
      if (/麺|うどん|そば|蕎麦|パスタ|スパゲッティ|ラーメン|ナポリタン/.test(name)) return '麺類'
      if (/サンド/.test(name)) return 'サンドイッチ'
      if (/パン|トースト/.test(name)) return 'パン'
      return 'ごはん'
    default: return 'その他'
  }
}

// Notion の rich_text は1要素2000文字まで
function richText_(text) {
  const parts = []
  for (let i = 0; i < text.length; i += 2000) parts.push({ type: 'text', text: { content: text.slice(i, i + 2000) } })
  return parts
}

function isEmptyProp_(prop) {
  if (!prop) return true
  switch (prop.type) {
    case 'title': return !prop.title.length
    case 'rich_text': return !prop.rich_text.length
    case 'number': return prop.number === null
    case 'url': return !prop.url
    case 'multi_select': return !prop.multi_select.length
    case 'select': return !prop.select
    default: return false
  }
}

function normalizeName_(name) {
  return String(name || '').normalize('NFKC').replace(/\s+/g, '')
}

// ---- 共通 ----

function prop_(name) {
  const v = PropertiesService.getScriptProperties().getProperty(name)
  if (!v) throw new Error('script property ' + name + ' is not set')
  return v
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

function getCachedJson_(key) {
  const cache = CacheService.getScriptCache()
  const count = Number(cache.get(key + ':n') || 0)
  if (!count) return null
  const keys = []
  for (let i = 0; i < count; i++) keys.push(key + ':' + i)
  const parts = cache.getAll(keys)
  let text = ''
  for (let i = 0; i < count; i++) {
    const part = parts[key + ':' + i]
    if (part == null) return null
    text += part
  }
  return JSON.parse(text)
}

function putCachedJson_(key, value, seconds) {
  const text = JSON.stringify(value)
  const entries = {}
  let n = 0
  for (let i = 0; i < text.length; i += CACHE_CHUNK_CHARS) {
    entries[key + ':' + n] = text.slice(i, i + CACHE_CHUNK_CHARS)
    n++
  }
  entries[key + ':n'] = String(n)
  CacheService.getScriptCache().putAll(entries, seconds)
}

// エディタから実行して設定と変換を確かめる用（認証は通さない）
function debugListRecipes() {
  const db = listRecipes_(true)
  Logger.log('recipes: %s', db.recipes.length)
  Logger.log(JSON.stringify(db.recipes[0], null, 2))
}
