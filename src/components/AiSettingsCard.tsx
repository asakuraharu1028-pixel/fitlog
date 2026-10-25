import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import {
  getAiConfig, saveAiConfig, callProvider, listModels,
  DEFAULT_GEMINI_MODEL, DEFAULT_OPENROUTER_MODEL,
  type AiConfig, type AiProvider,
} from '../lib/ai'

type Status = { ok: boolean; text: string } | null

export default function AiSettingsCard() {
  const [config, setConfig] = useState<AiConfig>(getAiConfig)
  const [saved, setSaved] = useState(false)
  const set = (k: keyof AiConfig, v: string) => setConfig(c => ({ ...c, [k]: v }))

  const save = () => {
    saveAiConfig(config)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h2 className="font-semibold text-gray-700 mb-1">AI（食品解析・アドバイス）</h2>
      <p className="text-xs text-gray-400 mb-3">
        Gemini を優先して使い、失敗したとき（上限超過・エラーなど）は OpenRouter に自動で切り替えます。
        どちらか片方だけの設定でも使えます。
      </p>

      <ProviderSection
        provider="gemini"
        title="① Gemini（優先）"
        help={<>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-green-500 underline">
            Google AI Studio
          </a> → Create API key
        </>}
        keyValue={config.geminiKey}
        keyPlaceholder="AIza..."
        modelValue={config.geminiModel}
        defaultModel={DEFAULT_GEMINI_MODEL}
        onKeyChange={v => set('geminiKey', v)}
        onModelChange={v => set('geminiModel', v)}
        onBeforeTest={() => saveAiConfig(config)}
      />

      <div className="border-t border-gray-100 my-4" />

      <ProviderSection
        provider="openrouter"
        title="② OpenRouter（予備・無料モデル）"
        help={<>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-green-500 underline">
            openrouter.ai
          </a> でログイン → Keys → Create Key
        </>}
        keyValue={config.openRouterKey}
        keyPlaceholder="sk-or-..."
        modelValue={config.openRouterModel}
        defaultModel={DEFAULT_OPENROUTER_MODEL}
        onKeyChange={v => set('openRouterKey', v)}
        onModelChange={v => set('openRouterModel', v)}
        onBeforeTest={() => saveAiConfig(config)}
      />

      <p className="text-xs text-gray-400 mt-3">APIキーは端末のlocalStorageにのみ保存されます（Driveには同期されません）</p>
      <button
        onClick={save}
        className="mt-3 w-full bg-purple-500 text-white rounded-xl py-2.5 font-semibold hover:bg-purple-600 transition"
      >
        {saved ? '✓ 保存しました' : 'AI設定を保存'}
      </button>
    </div>
  )
}

function ProviderSection({
  provider, title, help, keyValue, keyPlaceholder, modelValue, defaultModel,
  onKeyChange, onModelChange, onBeforeTest,
}: {
  provider: AiProvider
  title: string
  help: React.ReactNode
  keyValue: string
  keyPlaceholder: string
  modelValue: string
  defaultModel: string
  onKeyChange: (v: string) => void
  onModelChange: (v: string) => void
  onBeforeTest: () => void
}) {
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const listId = `${provider}-models`

  const fetchModels = async () => {
    setLoadingModels(true)
    setStatus(null)
    try {
      const list = await listModels(provider, keyValue.trim())
      setModels(list)
      setStatus({ ok: true, text: `${list.length}件のモデルが見つかりました。モデル欄をタップすると候補が出ます` })
    } catch (e) {
      setStatus({ ok: false, text: `一覧の取得に失敗: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setLoadingModels(false)
    }
  }

  const test = async () => {
    // 入力中の内容で試せるよう、テスト前に保存する
    onBeforeTest()
    setTesting(true)
    setStatus(null)
    try {
      const reply = await callProvider(provider, { prompt: '「OK」とだけ返答してください。' })
      setStatus({ ok: true, text: `接続OK（応答: ${reply.slice(0, 30)}）` })
    } catch (e) {
      setStatus({ ok: false, text: `接続失敗: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-400">{help}</p>

      <label className="block">
        <span className="text-xs font-medium text-gray-600">APIキー</span>
        <div className="relative mt-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={keyValue}
            onChange={e => onKeyChange(e.target.value)}
            placeholder={keyPlaceholder}
            className="block w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-gray-600">モデル</span>
        <input
          list={listId}
          value={modelValue}
          onChange={e => onModelChange(e.target.value)}
          placeholder={defaultModel}
          className="mt-1 block w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <datalist id={listId}>
          {models.map(m => <option key={m} value={m} />)}
        </datalist>
      </label>

      <div className="flex gap-3 text-xs">
        <button
          type="button"
          onClick={fetchModels}
          disabled={loadingModels || (provider === 'gemini' && !keyValue.trim())}
          className="text-green-600 underline disabled:text-gray-300 disabled:no-underline"
        >
          {loadingModels ? '取得中...' : 'モデル一覧を取得'}
        </button>
        <button
          type="button"
          onClick={test}
          disabled={testing || !keyValue.trim()}
          className="text-green-600 underline disabled:text-gray-300 disabled:no-underline"
        >
          {testing ? 'テスト中...' : '接続テスト'}
        </button>
        {modelValue !== defaultModel && (
          <button type="button" onClick={() => onModelChange(defaultModel)} className="text-gray-400 underline">
            既定に戻す
          </button>
        )}
      </div>

      {status && (
        <p className={`text-xs break-all ${status.ok ? 'text-green-600' : 'text-red-500'}`}>{status.text}</p>
      )}
    </div>
  )
}
