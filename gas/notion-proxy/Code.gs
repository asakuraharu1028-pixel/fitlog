/**
 * fitlog レシピ中継
 *
 * Notion の「DB_レシピリスト」を読み、fitlog の Recipe 形式に変換して返す。
 * createRecipe・updateRecipe・deleteRecipe でアプリからの追加・編集・削除を Notion に反映する。
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
 *   { "action": "createRecipe", "token": "...", "recipe": <Recipe> }           → data: <Recipe>
 *   { "action": "updateRecipe", "token": "...", "id": "<ページID>", "recipe": <Recipe> } → data: <Recipe>
 *   { "action": "deleteRecipe", "token": "...", "id": "<ページID>" }           → data: { id }
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

// 「使う材料」でつなぐ DB_材料リスト。スクリプトプロパティ INGREDIENT_DB_ID があればそちらを使う
const INGREDIENT_DB_ID = '27cbbbea3936823fb81281a0c8f3d980'
const INGREDIENT_RELATION = '使う材料'
// 材料としてつながない分量の行
const INGREDIENT_SKIP = ['水', '湯', 'お湯', '氷', '付属のタレ', 'トッピング', 'ブロッコリー・トマトなど', '無塩スパイスミックス又はハーブミックス']
// 分量の書き方 → DB_材料リスト の材料名（複数につなぐときは配列）。かっこ書き・かぎかっこと「A」「B」の印は先に外す
const INGREDIENT_ALIASES = {
  'ニンニク': 'にんにく', '料理酒': '酒', 'うす口しょうゆ': 'しょうゆ', 'ゴマ油': 'ごま油', '炒りごま': 'いりごま',
  '麺つゆ': 'めんつゆ', '濃縮めんつゆ': 'めんつゆ', '粗挽き黒こしょう': '黒こしょう', '塩胡椒': ['塩', 'こしょう'],
  '瀬戸のほんじお': '塩', '天然塩': '塩', 'ほんだし': '和風だし', '洋風スープの素': 'コンソメ', '鶏だし': '鶏がらスープの素',
  '一味とうがらし': '唐辛子', '七味とうがらし': '唐辛子', 'トマト水煮缶': 'トマト缶', '海苔': '焼きのり',
  '青ねぎ': '小ねぎ', '刻み青ネギ': '小ねぎ', '大根おろし': '大根', '冷凍枝豆': 'ゆで枝豆', '温かいご飯': 'ごはん', '米': 'ごはん',
  '鶏胸肉': '鶏むね', 'ショルダーベーコン': 'ベーコン', 'むきえび': 'えび',
  '大葉': '青じそ', '青しそ葉': '青じそ', 'ドライパセリ': 'パセリ', '乾燥パセリ': 'パセリ', 'イタリアンパセリ': 'パセリ',
  '舞茸': 'まいたけ', '長芋': '長いも', '胡瓜': 'きゅうり', '茄子': 'なす', 'マグロ': 'まぐろ',
  '豚赤身ひき肉': '豚ひき肉', '豚もも挽肉': '豚ひき肉', '牛赤身ひき肉': '牛ひき肉',
  '豚もも薄切り肉': '豚もも', '牛もも薄切り肉': '牛もも', '豚バラ薄切り肉': '豚バラ', '豚ばら薄切り肉': '豚バラ',
  'ウインナーソーセージ': 'ウインナー', 'ひきわり納豆': '納豆', '絹豆腐': '絹ごし豆腐', 'カットわかめ': 'わかめ', '乾燥わかめ': 'わかめ',
  'さば水煮缶': 'さば缶', 'さばみそ煮缶': 'さば缶', '白滝': '糸こんにゃく', '焼き肉のたれ': '焼肉のたれ', 'ハーブ入りソルト': 'ハーブソルト',
  '醤油': 'しょうゆ', '薄口しょうゆ': 'しょうゆ', '味噌': 'みそ', '人参': 'にんじん', '生姜': 'しょうが',
  'おろし生姜': 'しょうが', 'おろしにんにく': 'にんにく', 'すりおろしにんにく': 'にんにく',
  'オリーブオイル': 'オリーブ油', 'ケチャップ': 'トマトケチャップ', 'ぽん酢しょうゆ': 'ポン酢', 'ポン酢しょうゆ': 'ポン酢',
  '粗びき黒こしょう': '黒こしょう', 'お酢': '酢', 'すし酢': '酢', '米油': 'サラダ油', '小麦粉': '薄力粉', '乾燥パン粉': 'パン粉',
  'ご飯': 'ごはん', 'もち麦ご飯': 'ごはん', 'もち麦ごはん': 'ごはん', '麦ご飯': 'ごはん',
  '白ごま': 'いりごま', '白いりごま': 'いりごま', '白すりごま': 'すりごま', 'かつお節': '削り節',
  '長葱': '長ねぎ', '小口ねぎ': '小ねぎ', '細ねぎ': '小ねぎ', 'カットしめじ': 'しめじ', '冷凍ブロッコリー': 'ブロッコリー',
  'パプリカ': 'パプリカ赤・黄', 'アボカド': '冷凍アボカド', '赤とうがらし': '唐辛子',
  'ツナ水煮': 'ツナ缶', 'トマト水煮': 'トマト缶', 'ホールコーン': 'コーン缶',
  '顆粒コンソメ': 'コンソメ', '和風だしの素': '和風だし', '鰹だしの素': '和風だし', '鶏がらスープ': '鶏がらスープの素',
  '鶏ささ身': '鶏ささみ', '牛こま切れ肉': '牛こま', '牛こま肉': '牛こま', '豚ロース肉': '豚ロース', '豚ロース薄切り肉': '豚ロース',
  'ロースハム': 'ハム', 'ボンレスハム': 'ハム', '鮭': '生鮭', 'たこ': '蒸したこ', 'かにかま': 'かに風味かまぼこ',
  '溶き卵': '卵', '卵黄': '卵', '卵白': '卵', '温泉卵': '卵', 'ゆで卵': '卵',
  'プレーンヨーグルト': 'ヨーグルト', 'ギリシャヨーグルト': 'ヨーグルト', '水溶き片栗粉': '片栗粉',
}

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
      case 'createRecipe':
        return json_({ ok: true, data: createRecipe_(req.recipe) })
      case 'updateRecipe':
        return json_({ ok: true, data: updateRecipe_(req.id, req.recipe) })
      case 'deleteRecipe':
        return json_({ ok: true, data: deleteRecipe_(req.id) })
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
  // fromRecipe_ がメモの末尾に残した「タグ: …」はタグに戻す
  let note = plainText_(p['メモ'])
  const tagLine = note.match(/(?:^|\n)タグ: (.*)$/)
  if (tagLine) {
    tagLine[1].split('、').map(t => t.trim()).filter(Boolean).forEach(t => {
      if (tags.indexOf(t) < 0) tags.push(t)
    })
    note = note.slice(0, tagLine.index).trim()
  }
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
  const index = tryIngredientIndex_()
  const byName = {}
  queryDatabase_(databaseId).forEach(page => {
    if (page.archived || page.in_trash) return
    const key = normalizeName_(plainText_((page.properties || {})['料理名']))
    if (key && !byName[key]) byName[key] = page
  })

  const results = recipes.map(recipe => {
    try {
      const props = fromRecipe_(recipe)
      setIngredientRelation_(props, recipe.ingredients, index)
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
  clearRecipesCache_()
  return { results: results }
}

// ---- 追加・編集・削除 ----

function createRecipe_(recipe) {
  const props = fromRecipe_(recipe)
  setIngredientRelation_(props, recipe.ingredients, tryIngredientIndex_())
  const created = notion_('post', '/pages', { parent: { database_id: prop_('RECIPE_DB_ID') }, properties: props })
  clearRecipesCache_()
  return toRecipe_(created)
}

// アプリのフォームの内容で上書きする。空にした項目は Notion でも空にする。
// カテゴリーは fitlog の分類が変わったときだけ書き換え（「主菜・副菜」のような複数指定を残す）、
// 下味冷凍の「不可」と、アプリにない列（曜日など）は触らない。使う材料は分量からつなぎ直す
function updateRecipe_(id, recipe) {
  const page = getRecipePage_(id)
  const props = fromRecipe_(recipe, true)
  setIngredientRelation_(props, recipe.ingredients, tryIngredientIndex_(), true)
  if (toCategory_(multiSelect_(page.properties['カテゴリー'])) === recipe.category) delete props['カテゴリー']
  if (!props['下味冷凍'] && select_(page.properties['下味冷凍']) === '可') props['下味冷凍'] = { select: null }
  const updated = notion_('patch', '/pages/' + page.id, { properties: props })
  clearRecipesCache_()
  return toRecipe_(updated)
}

// Notion のゴミ箱に移す（Notion から元に戻せる）
function deleteRecipe_(id) {
  const page = getRecipePage_(id)
  notion_('patch', '/pages/' + page.id, { archived: true })
  clearRecipesCache_()
  return { id: page.id }
}

// レシピDBのページだけを編集・削除の対象にする（インテグレーションが見える他のページは触らせない）
function getRecipePage_(id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{32,36}$/i.test(id)) throw new Error('invalid id')
  const page = notion_('get', '/pages/' + id)
  const parent = page.parent && page.parent.database_id
  const dbId = prop_('RECIPE_DB_ID')
  if (!parent || parent.replace(/-/g, '') !== dbId.replace(/-/g, '') || page.archived || page.in_trash) {
    throw new Error('recipe not found')
  }
  return page
}

function clearRecipesCache_() {
  CacheService.getScriptCache().remove(RECIPES_CACHE_KEY + ':n')
}

// ---- 使う材料（DB_材料リストとのリレーション） ----

// 材料名 → DB_材料リストのページID
function ingredientIndex_() {
  const dbId = PropertiesService.getScriptProperties().getProperty('INGREDIENT_DB_ID') || INGREDIENT_DB_ID
  const index = {}
  queryDatabase_(dbId).forEach(page => {
    if (page.archived || page.in_trash) return
    const name = plainText_((page.properties || {})['材料']).normalize('NFKC').trim()
    if (name && !index[name]) index[name] = page.id
  })
  return index
}

// アプリからの書き込み用。DB_材料リストが読めなくてもレシピの保存は止めない（使う材料は触らない）
function tryIngredientIndex_() {
  try {
    return ingredientIndex_()
  } catch (err) {
    Logger.log('DB_材料リストを読めない: %s', (err && err.message) || err)
    return null
  }
}

// 分量の材料名を DB_材料リストの名前にそろえる（「塩胡椒」のように複数なら配列）。水など、つながない行は null
function ingredientKey_(raw) {
  let s = String(raw || '').normalize('NFKC').trim()
  s = s.replace(/^[A-Z](?=[^\sA-Za-z])/, '')          // 「Aしょうゆ」の A
  s = s.replace(/\([^)]*\)/g, '').trim()              // 「鶏むね肉（皮なし）」のかっこ書き
  s = s.replace(/[「」『』]/g, '')                     // 「ほんだし」のかぎかっこ
  s = s.split(/\s+/)[0] || ''                         // 「まぐろ ６切れ」の後ろ
  if (!s || /^-+$/.test(s) || INGREDIENT_SKIP.indexOf(s) >= 0) return null
  return INGREDIENT_ALIASES[s] || s
}

// 材料の配列 → { ids: つながるページID, unmatched: DB_材料リストにない名前 }
function matchIngredients_(ingredients, index) {
  const ids = []
  const unmatched = []
  ;(Array.isArray(ingredients) ? ingredients : []).forEach(i => {
    const keys = ingredientKey_(i && i.name)
    if (!keys) return
    ;[].concat(keys).forEach(key => {
      // 「鶏むね肉」→「鶏むね」のように、末尾の「肉」を外して当たるものも拾う
      const id = index[key] || (/.肉$/.test(key) ? index[key.slice(0, -1)] : undefined)
      if (id) {
        if (ids.indexOf(id) < 0) ids.push(id)
      } else if (unmatched.indexOf(key) < 0) {
        unmatched.push(key)
      }
    })
  })
  return { ids: ids, unmatched: unmatched }
}

// props に使う材料を入れる。clear なら、つながる材料がなくても空で上書きする。index がなければ何もしない
function setIngredientRelation_(props, ingredients, index, clear) {
  if (!index) return
  const ids = matchIngredients_(ingredients, index).ids
  if (ids.length || clear) props[INGREDIENT_RELATION] = { relation: ids.map(id => ({ id: id })) }
}

// 使う材料が空のレシピに、分量からリレーションを入れる。dryRun なら書き込まずに結果だけ返す
function linkIngredients_(dryRun) {
  const index = ingredientIndex_()
  const result = { checked: 0, linked: 0, noMatch: [], unmatched: {} }
  queryDatabase_(prop_('RECIPE_DB_ID')).forEach(page => {
    if (page.archived || page.in_trash) return
    const p = page.properties || {}
    if (!isEmptyProp_(p[INGREDIENT_RELATION])) return
    result.checked++
    const m = matchIngredients_(parseIngredients_(plainText_(p['分量'])), index)
    m.unmatched.forEach(name => { result.unmatched[name] = (result.unmatched[name] || 0) + 1 })
    if (!m.ids.length) {
      result.noMatch.push(plainText_(p['料理名']))
      return
    }
    if (!dryRun) {
      notion_('patch', '/pages/' + page.id, { properties: { [INGREDIENT_RELATION]: { relation: m.ids.map(id => ({ id: id })) } } })
    }
    result.linked++
  })
  if (!dryRun) clearRecipesCache_()
  return result
}

// Recipe → Notion のプロパティ。値のないものは含めない（clear なら空の値で上書きする）
function fromRecipe_(r, clear) {
  if (!r || typeof r.name !== 'string' || !r.name.trim()) throw new Error('name is required')
  const props = { '料理名': { title: richText_(r.name.trim()) } }
  props['カテゴリー'] = { multi_select: [{ name: toNotionCategory_(r.category, r.name) }] }

  const tags = Array.isArray(r.tags) ? r.tags : []
  if (tags.indexOf('冷凍可') >= 0) props['冷凍可'] = { multi_select: [{ name: '冷凍可' }] }
  else if (clear) props['冷凍可'] = { multi_select: [] }
  if (tags.indexOf('下味冷凍可') >= 0) props['下味冷凍'] = { select: { name: '可' } }

  const numbers = { '人数': r.servings, 'kcal': r.calories, 'たんぱく質': r.protein, '脂質': r.fat, '炭水化物': r.carbs, '食塩相当量': r.sodium }
  Object.keys(numbers).forEach(name => {
    if (typeof numbers[name] === 'number' && isFinite(numbers[name])) props[name] = { number: numbers[name] }
    else if (clear) props[name] = { number: null }
  })

  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .filter(i => i && i.name)
    .map(i => i.amount ? i.name + '｜' + i.amount : i.name)

  // Notion に列のないタグはメモに残す
  const otherTags = tags.filter(t => t !== '冷凍可' && t !== '下味冷凍可')
  const note = [r.note || '', otherTags.length ? 'タグ: ' + otherTags.join('、') : ''].filter(Boolean).join('\n')
  const texts = { '分量': ingredients.join('\n'), 'メモ': note, 'fitlog画像ID': r.imageFileId || '' }
  Object.keys(texts).forEach(name => {
    if (texts[name]) props[name] = { rich_text: richText_(texts[name]) }
    else if (clear) props[name] = { rich_text: [] }
  })
  if (r.sourceUrl) props['URL'] = { url: r.sourceUrl }
  else if (clear) props['URL'] = { url: null }
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
    case 'relation': return !prop.relation.length
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

// エディタから実行する：使う材料が空のレシピについて、つながる件数とDB_材料リストにない材料を表示（書き込まない）
function debugLinkIngredientsDryRun() {
  logLinkResult_(linkIngredients_(true))
}

// エディタから実行する：使う材料が空のレシピに、分量からリレーションを入れる
function runLinkIngredients() {
  logLinkResult_(linkIngredients_(false))
}

function logLinkResult_(r) {
  Logger.log('対象 %s 件 / つないだ %s 件 / 1つもつながらない %s 件', r.checked, r.linked, r.noMatch.length)
  const names = Object.keys(r.unmatched).sort((a, b) => r.unmatched[b] - r.unmatched[a])
  Logger.log('DB_材料リストにない材料 %s 種類: %s', names.length, names.map(n => n + '(' + r.unmatched[n] + ')').join('、'))
  if (r.noMatch.length) Logger.log('1つもつながらないレシピ: %s', r.noMatch.join('、'))
}

// エディタから実行して設定と変換を確かめる用（認証は通さない）
function debugListRecipes() {
  const db = listRecipes_(true)
  Logger.log('recipes: %s', db.recipes.length)
  Logger.log(JSON.stringify(db.recipes[0], null, 2))
}
