import { stripGroupLabels } from './gemini'
import { generateJson, hasAiKey } from './ai'

export interface FetchedRecipe {
  name: string
  servings: number
  ingredientsText: string  // 改行区切りの材料テキスト
  note: string
  sourceUrl: string
}

// ── CORSプロキシ経由でHTMLを取得（複数プロキシにフォールバック）──
const CORS_PROXIES: Array<(url: string) => { fetchUrl: string; extract: (r: Response) => Promise<string> }> = [
  // corsproxy.io: レスポンスが直接HTML
  (url) => ({
    fetchUrl: `https://corsproxy.io/?${encodeURIComponent(url)}`,
    extract:  (r) => r.text(),
  }),
  // allorigins.win: JSON包装
  (url) => ({
    fetchUrl: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    extract:  async (r) => {
      const data = await r.json() as { contents?: string }
      if (!data.contents) throw new Error('contents が空です')
      return data.contents
    },
  }),
  // thingproxy: レスポンスが直接HTML
  (url) => ({
    fetchUrl: `https://thingproxy.freeboard.io/fetch/${url}`,
    extract:  (r) => r.text(),
  }),
]

async function fetchHtml(url: string): Promise<string> {
  const errors: string[] = []
  for (const proxyFn of CORS_PROXIES) {
    const { fetchUrl, extract } = proxyFn(url)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)
      const res = await fetch(fetchUrl, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await extract(res)
      if (!html || html.length < 100) throw new Error('取得したHTMLが短すぎます')
      return html
    } catch (e) {
      errors.push(`${fetchUrl.split('?')[0]}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(`ページを取得できませんでした。\n${errors.join('\n')}`)
}

// ── Schema.org Recipe JSON-LD を抽出 ─────────────────────────
interface SchemaRecipe {
  '@type'?: string | string[]
  name?: string
  recipeIngredient?: string[]
  recipeYield?: string | number | string[]
  description?: string
  nutrition?: { calories?: string }
}

function extractSchemaRecipe(html: string): SchemaRecipe | null {
  // <script type="application/ld+json"> をすべて取得
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1])
      // 単体オブジェクト or @graph 配列に対応
      const items: SchemaRecipe[] = Array.isArray(json)
        ? json
        : json['@graph']
          ? json['@graph']
          : [json]

      for (const item of items) {
        const type = item['@type']
        const types = Array.isArray(type) ? type : [type ?? '']
        if (types.some(t => t.toLowerCase() === 'recipe')) {
          return item
        }
      }
    } catch {
      // JSON parse 失敗は無視して次へ
    }
  }
  return null
}

function parseServings(raw: string | number | string[] | undefined): number {
  if (!raw) return 1
  const s = Array.isArray(raw) ? raw[0] : String(raw)
  const n = parseInt(s.replace(/\D+/g, ''), 10)
  return isNaN(n) || n < 1 ? 1 : n
}

interface ExtractedRecipe {
  name?: string
  servings?: number
  ingredients?: string[]
  note?: string
}

// ── ページテキストをAIで解析（フォールバック）─────────────
async function extractByAI(html: string, url: string): Promise<FetchedRecipe> {
  if (!hasAiKey()) throw new Error('Schema.orgデータが見つかりません。AIを使うにはAPIキーを設定してください')

  // HTMLタグを除去してテキストのみ抽出（長すぎる場合は先頭5000文字）
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 5000)

  const prompt = `以下はレシピページのテキストです。レシピ情報を抽出してください。
必ず以下のJSON形式のみで返答してください:
{"name":"料理名","servings":人数の数値,"ingredients":["材料1 量1","材料2 量2",...],"note":"料理の説明や手順の概要（100文字以内）"}

テキスト:
${text}`

  const parsed = await generateJson<ExtractedRecipe>({ prompt }, 'object')

  return {
    name:            parsed.name ?? '',
    servings:        parsed.servings ?? 1,
    ingredientsText: stripGroupLabels((parsed.ingredients ?? []).join('\n')),
    note:            parsed.note ?? '',
    sourceUrl:       url,
  }
}

// ── レシピ画像からAIで抽出 ────────────────────────────────────
const IMAGE_PROMPT = `あなたは料理アシスタントです。レシピの画像（レシピカード・書籍・手書きメモ・スクリーンショット等）から情報を読み取ってください。
必ず以下のJSON形式のみで返答してください（説明文不要）:
{"name":"料理名","servings":人数の数値,"ingredients":["材料1 量1","材料2 量2",...],"note":"料理の説明や手順の概要（100文字以内）"}
- 人数が読み取れない場合は1とする
- 材料は「食材名 分量」の形式で1行ずつ返す`

export async function extractRecipeFromImage(base64: string, mimeType: string): Promise<FetchedRecipe> {
  if (!hasAiKey()) throw new Error('画像から読み取るにはAPIキーを設定してください')

  const parsed = await generateJson<ExtractedRecipe>({
    system: IMAGE_PROMPT,
    prompt: 'このレシピ画像から料理名・人数・材料を読み取ってください。',
    image: { base64, mimeType },
  }, 'object')

  return {
    name:            parsed.name ?? '',
    servings:        parsed.servings ?? 1,
    ingredientsText: stripGroupLabels((parsed.ingredients ?? []).join('\n')),
    note:            parsed.note ?? '',
    sourceUrl:       '',
  }
}

// ── メインエントリ ────────────────────────────────────────────
export async function fetchRecipeFromUrl(url: string): Promise<FetchedRecipe> {
  const html = await fetchHtml(url)

  // まず Schema.org で試みる
  const schema = extractSchemaRecipe(html)
  if (schema && schema.recipeIngredient && schema.recipeIngredient.length > 0) {
    return {
      name:            schema.name ?? '',
      servings:        parseServings(schema.recipeYield),
      ingredientsText: stripGroupLabels(schema.recipeIngredient.join('\n')),
      note:            schema.description?.slice(0, 200) ?? '',
      sourceUrl:       url,
    }
  }

  // Schema.org になければ AI で解析
  return extractByAI(html, url)
}
