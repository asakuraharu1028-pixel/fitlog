import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../lib/store'
import { getApiKey, setApiKey } from '../lib/gemini'
import { CHARACTERS } from '../lib/characters'
import type { AdvisorCharacterId } from '../lib/characters'
import { loadFromDrive, saveToDrive, getAccessToken } from '../lib/google'
import { localDateStr } from '../lib/utils'
import type { BodyRecord, DietPolicy } from '../types'
type Gender = 'male' | 'female'
import { isNative } from '../lib/auth'
import {
  hcCheckAvailability, hcCheckPermissions, hcOpenPermissions,
  hcReadSteps, hcReadWeight, hcWriteWeight,
  hcReadBodyFat, hcWriteBodyFat,
  hcReadSleep,
} from '../lib/healthconnect'
import { nanoid } from 'nanoid'
import { Eye, EyeOff } from 'lucide-react'

/** ダイエット方針ごとの食事/運動の割合 */
const POLICY_RATIO: Record<DietPolicy, { meal: number; exercise: number }> = {
  meal:     { meal: 0.8, exercise: 0.2 },
  balance:  { meal: 0.5, exercise: 0.5 },
  exercise: { meal: 0.2, exercise: 0.8 },
}

const POLICY_LABELS: Record<DietPolicy, string> = {
  meal:     '食事管理中心',
  balance:  '食事・運動バランス',
  exercise: '運動中心',
}

const POLICY_DESC: Record<DietPolicy, string> = {
  meal:     '食事 80% / 運動 20%',
  balance:  '食事 50% / 運動 50%',
  exercise: '食事 20% / 運動 80%',
}

/** Mifflin-St Jeor 式による基礎代謝推算 */
function calcBmrEstimate(weightKg: number, heightCm: number, age: number, gender: Gender): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(gender === 'male' ? base + 5 : base - 161)
}

/** 摂取・消費目標カロリーを計算する */
function calcGoals(
  currentWeight: number,
  goalWeight: number,
  bmr: number,
  goalMonths: number,
  policy: DietPolicy,
): { intake: number; burn: number; dailyDeficit: number } | null {
  if (currentWeight <= 0 || goalWeight <= 0 || bmr <= 0 || goalMonths <= 0) return null
  // 1kg 脂肪 ≈ 7200 kcal
  const totalDeficit = (currentWeight - goalWeight) * 7200
  const dailyDeficit = totalDeficit / (goalMonths * 30)
  // TDEE = 基礎代謝 × 活動係数 1.3（軽い活動）
  const tdee = bmr * 1.3
  const ratio = POLICY_RATIO[policy]
  const intake = Math.round(tdee - dailyDeficit * ratio.meal)
  const burn   = Math.round(Math.max(0, dailyDeficit * ratio.exercise))
  return { intake: Math.max(1000, intake), burn, dailyDeficit }
}

type WarnLevel = 'danger' | 'caution'
interface Warning { level: WarnLevel; message: string }

function getWarnings(goals: { intake: number; burn: number; dailyDeficit: number }, gender?: Gender): Warning[] {
  const w: Warning[] = []
  const { intake, burn, dailyDeficit } = goals

  // 性別による最低摂取カロリーの閾値
  const dangerLimit  = gender === 'male' ? 1500 : 1200
  const cautionLimit = gender === 'male' ? 1800 : 1400

  if (intake < dangerLimit) {
    w.push({ level: 'danger',  message: `目標摂取カロリー（${intake} kcal）が健康的な最低ライン（${dangerLimit.toLocaleString()} kcal）を下回っています。目標期間を延ばすか、方針を見直してください。` })
  } else if (intake < cautionLimit) {
    w.push({ level: 'caution', message: `目標摂取カロリー（${intake} kcal）はかなり厳しい制限です。長期間の継続には注意が必要です。` })
  }

  // 消費カロリー（運動）
  if (burn > 1000) {
    w.push({ level: 'danger',  message: `目標消費カロリー（運動）が ${burn} kcal と非常に多く、現実的ではありません。目標期間を延ばすか、方針を変更してください。` })
  } else if (burn > 700) {
    w.push({ level: 'caution', message: `目標消費カロリー（運動）が ${burn} kcal と多めです。毎日の運動習慣が必要になります。` })
  }

  // ペース（1ヶ月あたりの減量）
  const kgPerMonth = (dailyDeficit * 30) / 7200
  if (kgPerMonth > 4) {
    w.push({ level: 'danger',  message: `月 ${kgPerMonth.toFixed(1)} kg ペースは急激すぎます。健康的なペースの目安は月 2 kg 以内です。` })
  } else if (kgPerMonth > 2) {
    w.push({ level: 'caution', message: `月 ${kgPerMonth.toFixed(1)} kg ペースは一般的な推奨（月 2 kg 以内）を超えています。無理のない範囲で進めましょう。` })
  }

  return w
}

export default function Settings() {
  const { data, saveData, loadData } = useAppStore()
  const s = data.settings

  const [height, setHeight]       = useState(String(s.heightCm))
  const [gender, setGender]       = useState<Gender | ''>(s.gender ?? '')
  const [age, setAge]             = useState(String(s.age ?? ''))
  const [goalWeight, setGoalWeight] = useState(String(s.goalWeightKg ?? ''))
  const [bmrInput, setBmrInput]   = useState(String(s.bmr ?? ''))
  const [goalMonths, setGoalMonths] = useState(String(s.goalMonths ?? ''))
  const [policy, setPolicy]       = useState<DietPolicy>(s.dietPolicy ?? 'balance')
  const [saved, setSaved]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [apiKey, setApiKeyState]  = useState(getApiKey)
  const [showKey, setShowKey]     = useState(false)
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [diagLog, setDiagLog]     = useState<string[]>([])
  const [diagRunning, setDiagRunning] = useState(false)
  const [hcLog, setHcLog]         = useState<string[]>([])
  const [hcRunning, setHcRunning] = useState(false)
  const [reloadMsg, setReloadMsg] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    setHeight(String(s.heightCm))
    setGender(s.gender ?? '')
    setAge(String(s.age ?? ''))
    setGoalWeight(String(s.goalWeightKg ?? ''))
    setBmrInput(String(s.bmr ?? ''))
    setGoalMonths(String(s.goalMonths ?? ''))
    setPolicy(s.dietPolicy ?? 'balance')
  }, [s])

  // 最新の体重レコード
  const latestWeight = useMemo(() => {
    if (data.bodyRecords.length === 0) return null
    return [...data.bodyRecords].sort((a, b) => b.date.localeCompare(a.date))[0].weight
  }, [data.bodyRecords])

  // 基礎代謝の参考値（Mifflin-St Jeor 式: 性別・年齢・身長・体重から推算）
  const bmrEstimate = useMemo(() => {
    const h = parseFloat(height)
    const a = parseFloat(age)
    if (latestWeight && !isNaN(h) && h > 0 && !isNaN(a) && a > 0 && gender) {
      return calcBmrEstimate(latestWeight, h, a, gender)
    }
    // フォールバック: 体重 × 22（性別・年齢未入力時）
    if (latestWeight) return Math.round(latestWeight * 22)
    return null
  }, [latestWeight, height, age, gender])

  // 目標カロリー自動計算
  const goals = useMemo(() => {
    const cw = latestWeight ?? 0
    const gw = parseFloat(goalWeight)
    const bmr = parseFloat(bmrInput) || (bmrEstimate ?? 0)
    const gm = parseFloat(goalMonths)
    return calcGoals(cw, gw, bmr, gm, policy)
  }, [latestWeight, goalWeight, bmrInput, bmrEstimate, goalMonths, policy])

  const effectiveGender = gender || undefined

  const handleSave = async () => {
    const h = parseFloat(height)
    if (isNaN(h) || h <= 0) return
    setSaving(true)
    try {
      await saveData({
        settings: {
          ...s,
          heightCm: h,
          gender:          gender      ? gender                  : undefined,
          age:             age         ? parseFloat(age)         : undefined,
          goalWeightKg:    goalWeight  ? parseFloat(goalWeight)  : undefined,
          bmr:             bmrInput    ? parseFloat(bmrInput)    : undefined,
          goalMonths:      goalMonths  ? parseFloat(goalMonths)  : undefined,
          dietPolicy:      policy,
          goalCalories:    goals?.intake,
          goalBurnCalories: goals?.burn,
        },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4">基本情報</h2>
        <div className="space-y-4">

          {/* 性別 */}
          <div>
            <span className="text-sm font-medium text-gray-600 block mb-1">性別</span>
            <div className="flex gap-2">
              {([['male', '男性'], ['female', '女性']] as [Gender, string][]).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setGender(gender === val ? '' : val)}
                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition
                    ${gender === val ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 年齢 */}
          <label className="block">
            <span className="text-sm font-medium text-gray-600">年齢</span>
            <input
              type="number" step="1" min="1" max="120" value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="例: 30"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>

          {/* 身長 */}
          <label className="block">
            <span className="text-sm font-medium text-gray-600">身長 (cm) <span className="text-red-400">*</span></span>
            <input
              type="number" step="0.1" value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="例: 170.0"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>

          {/* 現在の体重（読み取り専用：最新レコードから） */}
          <div>
            <span className="text-sm font-medium text-gray-600">現在の体重</span>
            <p className="mt-1 px-3 py-2 rounded-xl bg-gray-50 text-gray-700 text-sm">
              {latestWeight != null
                ? <><span className="font-bold text-blue-600">{latestWeight.toFixed(1)} kg</span><span className="text-gray-400 ml-2">（最新の体重記録から）</span></>
                : <span className="text-gray-400">体重記録がありません。体重ページから記録してください。</span>
              }
            </p>
          </div>

          {/* 基礎代謝 */}
          <label className="block">
            <span className="text-sm font-medium text-gray-600">基礎代謝 (kcal)</span>
            <input
              type="number" step="10" value={bmrInput}
              onChange={(e) => setBmrInput(e.target.value)}
              placeholder={bmrEstimate ? `参考値: ${bmrEstimate}` : '例: 1500'}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              {bmrEstimate
                ? `推定値: 約 ${bmrEstimate} kcal${gender && age ? '（Mifflin-St Jeor 式）' : '（体重×22、性別・年齢を入力するとより正確になります）'}（未入力の場合はこの値を使用）`
                : '体重計・健康アプリで確認した基礎代謝を入力してください'}
            </p>
          </label>

          {/* 目標体重 */}
          <label className="block">
            <span className="text-sm font-medium text-gray-600">目標体重 (kg)</span>
            <input
              type="number" step="0.1" value={goalWeight}
              onChange={(e) => setGoalWeight(e.target.value)}
              placeholder="例: 60.0"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>

          {/* 目標達成期間 */}
          <label className="block">
            <span className="text-sm font-medium text-gray-600">目標達成期間（ヶ月）</span>
            <input
              type="number" step="1" min="1" value={goalMonths}
              onChange={(e) => setGoalMonths(e.target.value)}
              placeholder="例: 3"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>

          {/* ダイエット方針 */}
          <div>
            <span className="text-sm font-medium text-gray-600 block mb-2">ダイエット方針</span>
            <div className="space-y-2">
              {(['meal', 'balance', 'exercise'] as DietPolicy[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPolicy(p)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-left transition
                    ${policy === p ? 'border-green-400 bg-green-50' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <span className={`text-sm font-medium ${policy === p ? 'text-green-700' : 'text-gray-700'}`}>
                    {POLICY_LABELS[p]}
                  </span>
                  <span className="text-xs text-gray-400">{POLICY_DESC[p]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 自動計算結果 */}
          {goals ? (() => {
            const warnings = getWarnings(goals, effectiveGender)
            const hasDanger  = warnings.some(w => w.level === 'danger')
            return (
              <div className="space-y-2">
                <div className={`rounded-xl p-3 space-y-2 ${hasDanger ? 'bg-red-50' : 'bg-orange-50'}`}>
                  <p className="text-xs font-semibold text-orange-700 mb-1">📊 自動計算された1日の目標</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">目標摂取カロリー</span>
                    <span className={`font-bold ${goals.intake < 1200 ? 'text-red-500' : 'text-green-600'}`}>
                      {goals.intake.toLocaleString()} kcal
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">目標消費カロリー（運動）</span>
                    <span className={`font-bold ${goals.burn > 1000 ? 'text-red-500' : 'text-orange-500'}`}>
                      {goals.burn.toLocaleString()} kcal
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-orange-100">
                    <span className="text-gray-400 text-xs">想定ペース</span>
                    <span className="text-xs text-gray-500">
                      月 {((goals.dailyDeficit * 30) / 7200).toFixed(1)} kg
                    </span>
                  </div>
                </div>
                {warnings.length > 0 && (
                  <div className="space-y-1.5">
                    {warnings.map((w, i) => (
                      <div key={i} className={`flex gap-2 rounded-xl px-3 py-2.5 text-xs
                        ${w.level === 'danger'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-yellow-50 text-yellow-800 border border-yellow-200'}`}>
                        <span className="shrink-0 mt-0.5">{w.level === 'danger' ? '🚨' : '⚠️'}</span>
                        <span>{w.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })() : (latestWeight != null && goalWeight && goalMonths) ? (
            <p className="text-xs text-red-400">計算に必要な値を入力してください</p>
          ) : null}

        </div>
      </div>

      {/* BMI目安 */}
      {height && !isNaN(parseFloat(height)) && (
        <div className="bg-green-50 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-green-700 mb-2">BMI目安（身長 {height} cm）</h3>
          <table className="w-full text-xs text-gray-600">
            <tbody>
              {[
                { label: '低体重', range: '18.5未満', bmi: 18.4 },
                { label: '普通体重', range: '18.5〜24.9', bmi: 21.7 },
                { label: '肥満(1度)', range: '25〜29.9', bmi: 27.5 },
                { label: '肥満(2度以上)', range: '30以上', bmi: 30 },
              ].map(({ label, range, bmi }) => {
                const h = parseFloat(height) / 100
                const kg = Math.round(bmi * h * h * 10) / 10
                return (
                  <tr key={label} className="border-b border-green-100">
                    <td className="py-1 font-medium">{label}</td>
                    <td className="py-1 text-center">BMI {range}</td>
                    <td className="py-1 text-right text-green-600">{kg} kg</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !height}
        className="w-full bg-green-500 text-white rounded-xl py-3 font-semibold disabled:opacity-40 hover:bg-green-600 active:bg-green-700 transition"
      >
        {saving ? '保存中...' : saved ? '✓ 保存しました' : '保存'}
      </button>

      {/* AIアドバイザーキャラクター */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-1">AIアドバイザー</h2>
        <p className="text-xs text-gray-400 mb-3">アドバイスの口調・キャラクターを選択できます</p>
        <div className="space-y-2">
          {CHARACTERS.map(c => {
            const isSelected = (data.settings.advisorCharacter ?? 'default') === c.id
            return (
              <button
                key={c.id}
                onClick={() => saveData({ settings: { ...data.settings, advisorCharacter: c.id as AdvisorCharacterId } })}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition
                  ${isSelected ? 'border-green-400 bg-green-50' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <span className="text-2xl w-8 text-center">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isSelected ? 'text-green-700' : 'text-gray-700'}`}>{c.name}</p>
                  <p className="text-xs text-gray-400 truncate">{c.description}</p>
                </div>
                {isSelected && <span className="text-green-500 text-xs font-bold shrink-0">選択中</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Claude API キー設定 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-1">AI食品解析</h2>
        <p className="text-xs text-gray-400 mb-3">
          食事の写真やテキストからAIが栄養素を自動推定します。<br />
          <span className="text-green-600 font-medium">OpenRouter（無料・推奨）</span><br />
          <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-green-500 underline">
            openrouter.ai
          </a> でGoogleログイン → Keys → Create Key<br />
          <span className="text-gray-400">※ GeminiのAPIキー（AIza...）も引き続き使えます</span>
        </p>
        <label className="block">
          <span className="text-sm font-medium text-gray-600">APIキー</span>
          <div className="relative mt-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              placeholder="sk-or-... または AIza..."
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
          <p className="text-xs text-gray-400 mt-1">端末のlocalStorageにのみ保存されます（サーバーには送信されません）</p>
        </label>
        <button
          onClick={() => {
            setApiKey(apiKey)
            setApiKeySaved(true)
            setTimeout(() => setApiKeySaved(false), 2000)
          }}
          className="mt-3 w-full bg-purple-500 text-white rounded-xl py-2.5 font-semibold hover:bg-purple-600 transition"
        >
          {apiKeySaved ? '✓ 保存しました' : 'APIキーを保存'}
        </button>
      </div>

      {/* Drive 再読み込み */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-2">Drive 同期</h2>
        <button
          onClick={async () => {
            setReloading(true)
            setReloadMsg(null)
            try {
              await loadData()
              const { data: d } = useAppStore.getState()
              setReloadMsg(`✓ 読み込み完了（歩数: ${(d.stepLogs ?? []).length}件、体重: ${d.bodyRecords.length}件）`)
            } catch (e) {
              setReloadMsg(`✗ エラー: ${e instanceof Error ? e.message : String(e)}`)
            } finally {
              setReloading(false)
            }
          }}
          disabled={reloading}
          className="w-full bg-blue-500 text-white rounded-xl py-2.5 font-semibold hover:bg-blue-600 disabled:opacity-40 transition"
        >
          {reloading ? '読み込み中...' : 'Drive から再読み込み'}
        </button>
        {reloadMsg && (
          <p className={`text-xs mt-1 ${reloadMsg.startsWith('✗') ? 'text-red-500' : 'text-green-600'}`}>{reloadMsg}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">Android で同期後、このボタンで Web に反映できます</p>
      </div>

      {/* Drive 診断 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-2">Drive 診断</h2>
        <button
          onClick={async () => {
            setDiagRunning(true)
            const logs: string[] = []
            try {
              const token = getAccessToken()
              logs.push(`トークン: ${token ? token.slice(0, 20) + '...' : 'なし'}`)

              logs.push('Drive から読み込みテスト中...')
              const remote = await loadFromDrive<Record<string, unknown>>()
              logs.push(`✓ Drive 読み込み成功: keys=${Object.keys(remote ?? {}).join(',') || 'なし(空)'}`)
              logs.push('Drive に書き込みテスト中...')
              const { data: currentData } = useAppStore.getState()
              await saveToDrive(currentData)
              logs.push('✓ Drive 書き込み成功（現在のデータを保存）')

            } catch (e) {
              logs.push(`✗ エラー: ${e instanceof Error ? e.message : String(e)}`)
            }
            setDiagLog(logs)
            setDiagRunning(false)
          }}
          disabled={diagRunning}
          className="w-full bg-gray-700 text-white rounded-xl py-2.5 font-semibold disabled:opacity-40"
        >
          {diagRunning ? '診断中...' : 'Drive 接続テスト'}
        </button>
        {diagLog.length > 0 && (
          <div className="mt-3 bg-gray-50 rounded-xl p-3 text-xs font-mono space-y-1">
            {diagLog.map((l, i) => (
              <p key={i} className={l.startsWith('✗') ? 'text-red-600' : l.startsWith('✓') ? 'text-green-600' : 'text-gray-600'}>{l}</p>
            ))}
          </div>
        )}
      </div>
      {/* Health Connect 連携（Android のみ） */}
      {isNative && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-1">Health Connect 連携</h2>
          <p className="text-xs text-gray-400 mb-3">体重・体脂肪率・睡眠・歩数を Health Connect と同期します</p>
          <button
            onClick={async () => {
              setHcRunning(true)
              const logs: string[] = []
              try {
                const status = await hcCheckAvailability()
                logs.push(`HC 状態: ${status}`)
                if (status !== 'available') {
                  logs.push('✗ Health Connect が利用できません')
                  setHcLog(logs); setHcRunning(false); return
                }

                logs.push('パーミッション確認中...')
                setHcLog([...logs])
                let granted = await hcCheckPermissions()
                if (!granted) {
                  logs.push('パーミッション画面を開いています...')
                  setHcLog([...logs])
                  granted = await hcOpenPermissions()
                }
                if (!granted) {
                  logs.push('✗ パーミッションが許可されませんでした')
                  setHcLog(logs); setHcRunning(false); return
                }
                logs.push('✓ パーミッション許可済み')

                const today = localDateStr()
                const past30 = localDateStr(new Date(Date.now() - 30 * 86400000))

                // 歩数を HC から読み込んで FitLog に保存
                logs.push('歩数を読み込み中...')
                setHcLog([...logs])
                const steps = await hcReadSteps(past30, today)
                logs.push(`✓ 歩数: ${steps.length}件`)
                if (steps.length > 0) {
                  const { data: stepsData, saveData: stepsSave } = useAppStore.getState()
                  // HC から取得した日付ごとに合計（同日複数レコードを集計）
                  const hcMap = new Map<string, number>()
                  for (const s of steps as { date: string; steps: number }[]) {
                    hcMap.set(s.date, (hcMap.get(s.date) ?? 0) + s.steps)
                  }
                  // 既存の stepLogs に HC データをマージ（HC 側を優先）
                  const existingOther = (stepsData.stepLogs ?? []).filter(
                    (s: { date: string }) => !hcMap.has(s.date)
                  )
                  const newStepLogs = [
                    ...existingOther,
                    ...Array.from(hcMap.entries()).map(([date, st]) => ({ date, steps: st })),
                  ].sort((a, b) => a.date.localeCompare(b.date))
                  await stepsSave({ stepLogs: newStepLogs })
                }

                // 体重を HC から読み込んで FitLog に追加
                logs.push('体重を HC から読み込み中...')
                setHcLog([...logs])
                const weights = await hcReadWeight(past30, today)
                logs.push(`✓ 体重: ${weights.length}件`)
                const { data: appData, saveData } = useAppStore.getState()
                const existingDates = new Set(appData.bodyRecords.map(r => r.date))
                const newRecords: BodyRecord[] = weights
                  .filter((w: { date: string; weightKg: number }) => !existingDates.has(w.date))
                  .map((w: { date: string; weightKg: number }) => {
                    const h = appData.settings.heightCm / 100
                    const bmi = Math.round(w.weightKg / (h * h) * 10) / 10
                    return { id: nanoid(), date: w.date, weight: w.weightKg, bmi }
                  })
                if (newRecords.length > 0) {
                  await saveData({ bodyRecords: [...appData.bodyRecords, ...newRecords].sort((a, b) => a.date.localeCompare(b.date)) })
                  logs.push(`✓ 体重 ${newRecords.length}件を FitLog に追加`)
                }

                // FitLog の体重を HC に書き込み
                logs.push('FitLog の体重を HC に書き込み中...')
                setHcLog([...logs])
                for (const r of appData.bodyRecords.slice(-7)) {
                  try { await hcWriteWeight(r.date, r.weight) } catch {}
                }
                logs.push('✓ 直近7日分の体重を HC に書き込み')

                // 体脂肪率を HC から読み込んで FitLog に追加
                logs.push('体脂肪率を HC から読み込み中...')
                setHcLog([...logs])
                const bodyFats = await hcReadBodyFat(past30, today)
                logs.push(`✓ 体脂肪率: ${bodyFats.length}件`)
                if (bodyFats.length > 0) {
                  const { data: bfData, saveData: bfSave } = useAppStore.getState()
                  const bfByDate = new Map(bodyFats.map((b: { date: string; bodyFatPct: number }) => [b.date, Math.round(b.bodyFatPct * 100) / 100]))
                  const updatedRecords: BodyRecord[] = bfData.bodyRecords.map(r =>
                    bfByDate.has(r.date)
                      ? { ...r, bodyFatPct: bfByDate.get(r.date) as number }
                      : r
                  )
                  await bfSave({ bodyRecords: updatedRecords })
                  logs.push(`✓ 体脂肪率を FitLog に反映`)
                }

                // FitLog の体脂肪率を HC に書き込み
                logs.push('FitLog の体脂肪率を HC に書き込み中...')
                setHcLog([...logs])
                const { data: bfWriteData } = useAppStore.getState()
                for (const r of bfWriteData.bodyRecords.slice(-7)) {
                  if (r.bodyFatPct != null) {
                    try { await hcWriteBodyFat(r.date, r.bodyFatPct) } catch {}
                  }
                }
                logs.push('✓ 直近7日分の体脂肪率を HC に書き込み')

                // 睡眠を HC から読み込んで FitLog に追加
                logs.push('睡眠を HC から読み込み中...')
                setHcLog([...logs])
                const sleeps = await hcReadSleep(past30, today)
                logs.push(`✓ 睡眠: ${sleeps.length}件取得`)
                if (sleeps.length === 0) {
                  logs.push('⚠ HC に睡眠データがないか、SleepSessionRecord が記録されていない可能性があります')
                }
                const { data: latestData, saveData: sleepSave } = useAppStore.getState()
                // HC データで startTime ごとに上書き（upsert）。HC 側を正とする
                // ※ 同日に本睡眠＋仮眠など複数セッションがある場合も全て保持する
                const hcSleepByStart = new Map(
                  sleeps.map((s: { date: string; startTime: string; endTime: string; durationMin: number }) => [s.startTime, s])
                )
                const existingOtherSleeps = (latestData.sleepLogs ?? []).filter(
                  (s: { startTime: string }) => !hcSleepByStart.has(s.startTime)
                )
                const hcSleepRecords = Array.from(hcSleepByStart.values()).map(
                  (s: { date: string; startTime: string; endTime: string; durationMin: number }) => ({ id: nanoid(), ...s })
                )
                const mergedSleepLogs = [...existingOtherSleeps, ...hcSleepRecords]
                  .sort((a, b) => a.date.localeCompare(b.date))
                await sleepSave({ sleepLogs: mergedSleepLogs })
                logs.push(`✓ 睡眠 ${hcSleepRecords.length}件を FitLog に反映（既存を HC データで更新）`)

                logs.push('🎉 同期完了！')
              } catch (e) {
                logs.push(`✗ エラー: ${e instanceof Error ? e.message : String(e)}`)
              }
              setHcLog(logs)
              setHcRunning(false)
            }}
            disabled={hcRunning}
            className="w-full bg-green-600 text-white rounded-xl py-2.5 font-semibold disabled:opacity-40"
          >
            {hcRunning ? '同期中...' : 'Health Connect と同期'}
          </button>
          {hcLog.length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3 text-xs font-mono space-y-1">
              {hcLog.map((l, i) => (
                <p key={i} className={l.startsWith('✗') ? 'text-red-600' : l.includes('✓') || l.includes('🎉') ? 'text-green-600' : 'text-gray-600'}>{l}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
