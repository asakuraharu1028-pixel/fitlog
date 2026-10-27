/**
 * fitlog レシピ中継（読み取り専用）
 *
 * Notion の「DB_レシピリスト」を読み、fitlog の Recipe 形式に変換して返す。
 * Notion のトークンはスクリプトプロパティに置き、アプリには渡さない。
 *
 * スクリプトプロパティ:
 *   NOTION_TOKEN   Notion インテグレーションのシークレット
 *   RECIPE_DB_ID   DB_レシピリスト のデータベースID
 *   ALLOWED_EMAIL  呼び出しを許可する Google アカウントのメールアドレス
 *
 * 呼び出し（POST, Content-Type: text/plain でプリフライトを避ける）:
 *   { "action": "listRecipes", "token": "<Google アクセストークン>", "refresh": false }
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
