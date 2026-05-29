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
  { id: 'radio_taiso',   name: 'ラジオ体操',               met: 4.0 },
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
  unit: 'reps' | 'seconds' // 回数 or 秒数
}

export const STRENGTH_DB: StrengthExercise[] = [
  // 胸
  { id: 'wall_push_up',   name: 'ウォールプッシュアップ', category: '胸',   metPerMin: 2.5, unit: 'reps' },
  { id: 'knee_push_up',   name: '膝つきプッシュアップ',   category: '胸',   metPerMin: 3.0, unit: 'reps' },
  { id: 'push_up',        name: 'プッシュアップ',         category: '胸',   metPerMin: 3.8, unit: 'reps' },
  { id: 'bench_press',    name: 'ベンチプレス',           category: '胸',   metPerMin: 5.0, unit: 'reps' },
  { id: 'dumbbell_fly',   name: 'ダンベルフライ',         category: '胸',   metPerMin: 4.0, unit: 'reps' },
  { id: 'incline_press',  name: 'インクラインプレス',     category: '胸',   metPerMin: 5.0, unit: 'reps' },
  // 背中
  { id: 'deadlift',       name: 'デッドリフト',           category: '背中', metPerMin: 6.0, unit: 'reps' },
  { id: 'pull_up',        name: '懸垂（チンアップ）',     category: '背中', metPerMin: 5.0, unit: 'reps' },
  { id: 'lat_pulldown',   name: 'ラットプルダウン',       category: '背中', metPerMin: 4.5, unit: 'reps' },
  { id: 'bent_over_row',  name: 'ベントオーバーロウ',     category: '背中', metPerMin: 5.0, unit: 'reps' },
  { id: 'seated_row',     name: 'シーテッドロウ',         category: '背中', metPerMin: 4.5, unit: 'reps' },
  // 肩
  { id: 'shoulder_press', name: 'ショルダープレス',       category: '肩',   metPerMin: 4.5, unit: 'reps' },
  { id: 'lateral_raise',  name: 'サイドレイズ',           category: '肩',   metPerMin: 3.5, unit: 'reps' },
  { id: 'front_raise',    name: 'フロントレイズ',         category: '肩',   metPerMin: 3.5, unit: 'reps' },
  // 腕
  { id: 'bicep_curl',     name: 'バイセップカール',       category: '腕',   metPerMin: 3.5, unit: 'reps' },
  { id: 'tricep_push',    name: 'トライセップスプッシュダウン', category: '腕', metPerMin: 3.5, unit: 'reps' },
  { id: 'hammer_curl',    name: 'ハンマーカール',         category: '腕',   metPerMin: 3.5, unit: 'reps' },
  // 脚
  { id: 'chair_squat',    name: '椅子スクワット',         category: '脚',   metPerMin: 2.8, unit: 'reps' },
  { id: 'squat',          name: 'スクワット',             category: '脚',   metPerMin: 5.0, unit: 'reps' },
  { id: 'leg_press',      name: 'レッグプレス',           category: '脚',   metPerMin: 4.5, unit: 'reps' },
  { id: 'lunge',          name: 'ランジ',                 category: '脚',   metPerMin: 4.0, unit: 'reps' },
  { id: 'leg_curl',       name: 'レッグカール',           category: '脚',   metPerMin: 3.5, unit: 'reps' },
  { id: 'leg_extension',  name: 'レッグエクステンション', category: '脚',   metPerMin: 3.5, unit: 'reps' },
  { id: 'calf_raise',     name: 'カーフレイズ',           category: '脚',   metPerMin: 3.0, unit: 'reps' },
  // 体幹
  { id: 'knee_plank',     name: '膝プランク',             category: '体幹', metPerMin: 2.5, unit: 'seconds' },
  { id: 'plank',          name: 'プランク',               category: '体幹', metPerMin: 3.5, unit: 'seconds' },
  { id: 'side_plank',     name: 'サイドプランク',         category: '体幹', metPerMin: 3.0, unit: 'seconds' },
  { id: 'crunch',         name: 'クランチ',               category: '体幹', metPerMin: 3.8, unit: 'reps' },
  { id: 'leg_raise',      name: 'レッグレイズ',           category: '体幹', metPerMin: 3.8, unit: 'reps' },
  { id: 'russian_twist',  name: 'ロシアンツイスト',       category: '体幹', metPerMin: 3.5, unit: 'reps' },
  { id: 'bird_dog',       name: 'バードドッグ',           category: '体幹', metPerMin: 2.5, unit: 'reps' },
  { id: 'dead_bug',       name: 'デッドバグ',             category: '体幹', metPerMin: 2.5, unit: 'reps' },
  // 全身
  { id: 'burpee',         name: 'バーピー',               category: '全身', metPerMin: 8.0, unit: 'reps' },
  { id: 'clean',          name: 'パワークリーン',         category: '全身', metPerMin: 6.0, unit: 'reps' },
  { id: 'kettlebell',     name: 'ケトルベルスイング',     category: '全身', metPerMin: 9.0, unit: 'reps' },
]

// 筋トレ消費カロリー推定
export function calcStrengthCalories(
  metPerMin: number,
  weightKg: number,
  sets: { weight: number; reps: number }[],
  isSeconds = false
): number {
  // 秒数種目：合計秒数をそのまま使う、回数種目：1セット2分と仮定
  const totalMin = isSeconds
    ? sets.reduce((s, v) => s + v.reps, 0) / 60
    : sets.length * 2
  return Math.round(metPerMin * weightKg * (totalMin / 60))
}

// 総ボリューム計算（重量 × 回数 の合計）
export function calcVolume(sets: { weight: number; reps: number }[]): number {
  return sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
}
