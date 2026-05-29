// 有酸素運動 MET値データベース
export interface CardioExercise {
  id: string
  name: string
  met: number // 代謝当量
}

export const CARDIO_DB: CardioExercise[] = [
  { id: 'walk_slow',     name: 'ウォーキング（ゆっくり）', met: 2.8 },
  { id: 'walk_normal',   name: 'ウォーキング（普通）',     met: 3.5 },
  { id: 'walk_fast',     name: 'ウォーキング（速歩）',     met: 4.5 },
  { id: 'jog',           name: 'ジョギング',               met: 7.0 },
  { id: 'run_slow',      name: 'ランニング（遅め）',       met: 8.0 },
  { id: 'run_normal',    name: 'ランニング（普通）',       met: 9.8 },
  { id: 'run_fast',      name: 'ランニング（速め）',       met: 11.0 },
  { id: 'cycling_slow',  name: '自転車（ゆっくり）',       met: 4.0 },
  { id: 'cycling_normal',name: '自転車（普通）',           met: 6.8 },
  { id: 'cycling_fast',  name: '自転車（速め）',           met: 10.0 },
  { id: 'swim_slow',     name: '水泳（ゆっくり）',         met: 5.8 },
  { id: 'swim_normal',   name: '水泳（普通）',             met: 8.3 },
  { id: 'swim_fast',     name: '水泳（速め）',             met: 10.0 },
  { id: 'rope_jump',     name: '縄跳び',                   met: 11.8 },
  { id: 'aerobics',      name: 'エアロビクス',             met: 6.5 },
  { id: 'dance',         name: 'ダンス',                   met: 5.0 },
  { id: 'yoga',          name: 'ヨガ',                     met: 3.0 },
  { id: 'stretching',    name: 'ストレッチ',               met: 2.3 },
  { id: 'hiit',          name: 'HIIT',                     met: 12.0 },
  { id: 'elliptical',    name: 'エリプティカル',           met: 5.0 },
  { id: 'stair',         name: '階段昇降',                 met: 8.0 },
  { id: 'tennis',        name: 'テニス',                   met: 7.3 },
  { id: 'badminton',     name: 'バドミントン',             met: 5.5 },
  { id: 'soccer',        name: 'サッカー',                 met: 7.0 },
  { id: 'basketball',    name: 'バスケットボール',         met: 6.5 },
]

// 消費カロリー計算: METs × 体重(kg) × 時間(h)
export function calcCardioCalories(met: number, weightKg: number, durationMin: number): number {
  return Math.round(met * weightKg * (durationMin / 60))
}

// 筋トレ種目データベース
export interface StrengthExercise {
  id: string
  name: string
  category: '胸' | '背中' | '肩' | '腕' | '脚' | '体幹' | '全身'
  metPerMin: number // 筋トレ中のMET（推定消費カロリー用）
}

export const STRENGTH_DB: StrengthExercise[] = [
  // 胸
  { id: 'bench_press',    name: 'ベンチプレス',         category: '胸',   metPerMin: 5.0 },
  { id: 'push_up',        name: 'プッシュアップ',       category: '胸',   metPerMin: 3.8 },
  { id: 'dumbbell_fly',   name: 'ダンベルフライ',       category: '胸',   metPerMin: 4.0 },
  { id: 'incline_press',  name: 'インクラインプレス',   category: '胸',   metPerMin: 5.0 },
  // 背中
  { id: 'deadlift',       name: 'デッドリフト',         category: '背中', metPerMin: 6.0 },
  { id: 'pull_up',        name: '懸垂（チンアップ）',   category: '背中', metPerMin: 5.0 },
  { id: 'lat_pulldown',   name: 'ラットプルダウン',     category: '背中', metPerMin: 4.5 },
  { id: 'bent_over_row',  name: 'ベントオーバーロウ',   category: '背中', metPerMin: 5.0 },
  { id: 'seated_row',     name: 'シーテッドロウ',       category: '背中', metPerMin: 4.5 },
  // 肩
  { id: 'shoulder_press', name: 'ショルダープレス',     category: '肩',   metPerMin: 4.5 },
  { id: 'lateral_raise',  name: 'サイドレイズ',         category: '肩',   metPerMin: 3.5 },
  { id: 'front_raise',    name: 'フロントレイズ',       category: '肩',   metPerMin: 3.5 },
  // 腕
  { id: 'bicep_curl',     name: 'バイセップカール',     category: '腕',   metPerMin: 3.5 },
  { id: 'tricep_push',    name: 'トライセップスプッシュダウン', category: '腕', metPerMin: 3.5 },
  { id: 'hammer_curl',    name: 'ハンマーカール',       category: '腕',   metPerMin: 3.5 },
  // 脚
  { id: 'squat',          name: 'スクワット',           category: '脚',   metPerMin: 5.0 },
  { id: 'leg_press',      name: 'レッグプレス',         category: '脚',   metPerMin: 4.5 },
  { id: 'lunge',          name: 'ランジ',               category: '脚',   metPerMin: 4.0 },
  { id: 'leg_curl',       name: 'レッグカール',         category: '脚',   metPerMin: 3.5 },
  { id: 'leg_extension',  name: 'レッグエクステンション', category: '脚', metPerMin: 3.5 },
  { id: 'calf_raise',     name: 'カーフレイズ',         category: '脚',   metPerMin: 3.0 },
  // 体幹
  { id: 'plank',          name: 'プランク',             category: '体幹', metPerMin: 3.5 },
  { id: 'crunch',         name: 'クランチ',             category: '体幹', metPerMin: 3.8 },
  { id: 'leg_raise',      name: 'レッグレイズ',         category: '体幹', metPerMin: 3.8 },
  { id: 'russian_twist',  name: 'ロシアンツイスト',     category: '体幹', metPerMin: 3.5 },
  // 全身
  { id: 'burpee',         name: 'バーピー',             category: '全身', metPerMin: 8.0 },
  { id: 'clean',          name: 'パワークリーン',       category: '全身', metPerMin: 6.0 },
  { id: 'kettlebell',     name: 'ケトルベルスイング',   category: '全身', metPerMin: 9.0 },
]

// 筋トレ消費カロリー推定: MET × 体重 × 時間（セット数×推定時間）
export function calcStrengthCalories(
  metPerMin: number,
  weightKg: number,
  sets: { weight: number; reps: number }[]
): number {
  // 1セットあたり約1〜2分（実施+休憩込みで2分と仮定）
  const totalMin = sets.length * 2
  return Math.round(metPerMin * weightKg * (totalMin / 60))
}

// 総ボリューム計算（重量 × 回数 の合計）
export function calcVolume(sets: { weight: number; reps: number }[]): number {
  return sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
}
