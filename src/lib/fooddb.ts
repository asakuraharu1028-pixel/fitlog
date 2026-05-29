export interface FoodDB {
  id: string
  name: string
  cal: number   // kcal/100g
  p: number     // タンパク質 g
  f: number     // 脂質 g
  c: number     // 炭水化物 g
  fiber: number // 食物繊維 g
  vitA: number  // ビタミンA μgRAE
  vitC: number  // ビタミンC mg
  vitD: number  // ビタミンD μg
  ca: number    // カルシウム mg
  fe: number    // 鉄 mg
  na: number    // ナトリウム mg
}

// 文部科学省 日本食品標準成分表2020年版(八訂)より抜粋
export const FOOD_DB: FoodDB[] = [
  // 穀類
  { id: 'rice_cooked',    name: 'ご飯(精白米)',       cal:168, p:2.5, f:0.3, c:37.1, fiber:1.5, vitA:0,   vitC:0,  vitD:0,   ca:3,   fe:0.1, na:1 },
  { id: 'rice_brown',     name: 'ご飯(玄米)',          cal:165, p:2.8, f:1.0, c:35.6, fiber:1.4, vitA:0,   vitC:0,  vitD:0,   ca:7,   fe:0.6, na:1 },
  { id: 'bread_white',    name: '食パン',              cal:264, p:9.3, f:4.4, c:46.7, fiber:2.3, vitA:0,   vitC:0,  vitD:0,   ca:29,  fe:0.8, na:496 },
  { id: 'noodle_udon',    name: 'うどん(ゆで)',        cal:105, p:2.6, f:0.4, c:21.6, fiber:0.8, vitA:0,   vitC:0,  vitD:0,   ca:10,  fe:0.2, na:210 },
  { id: 'noodle_soba',    name: 'そば(ゆで)',          cal:132, p:4.8, f:1.0, c:26.0, fiber:2.0, vitA:0,   vitC:0,  vitD:0,   ca:9,   fe:0.8, na:60 },
  { id: 'pasta',          name: 'スパゲッティ(ゆで)',  cal:165, p:5.8, f:0.9, c:32.2, fiber:3.0, vitA:0,   vitC:0,  vitD:0,   ca:7,   fe:0.6, na:1 },
  { id: 'oatmeal',        name: 'オートミール',        cal:380, p:13.7,f:5.7, c:69.1, fiber:9.4, vitA:0,   vitC:0,  vitD:0,   ca:47,  fe:3.9, na:3 },

  // 肉類
  { id: 'chicken_breast', name: '鶏むね肉(皮なし)',    cal:116, p:24.4,f:1.9, c:0,   fiber:0,   vitA:5,   vitC:3,  vitD:0.1, ca:4,   fe:0.3, na:42 },
  { id: 'chicken_thigh',  name: '鶏もも肉(皮あり)',    cal:204, p:17.3,f:14.2,c:0,   fiber:0,   vitA:40,  vitC:3,  vitD:0.1, ca:6,   fe:0.6, na:65 },
  { id: 'beef_loin',      name: '牛ロース',            cal:380, p:14.1,f:34.7,c:0.2, fiber:0,   vitA:5,   vitC:1,  vitD:0,   ca:3,   fe:1.4, na:47 },
  { id: 'beef_top_round', name: '牛もも肉(赤身)',      cal:182, p:21.3,f:10.7,c:0.4, fiber:0,   vitA:3,   vitC:1,  vitD:0,   ca:4,   fe:2.4, na:45 },
  { id: 'pork_loin',      name: '豚ロース',            cal:263, p:19.3,f:19.2,c:0.2, fiber:0,   vitA:4,   vitC:1,  vitD:0.4, ca:4,   fe:0.5, na:55 },
  { id: 'pork_belly',     name: '豚バラ肉',            cal:395, p:14.4,f:35.4,c:0.1, fiber:0,   vitA:6,   vitC:1,  vitD:0.5, ca:3,   fe:0.5, na:40 },

  // 魚介類
  { id: 'salmon',         name: 'サーモン(生)',        cal:204, p:20.1,f:12.8,c:0.1, fiber:0,   vitA:11,  vitC:1,  vitD:32.0,ca:14,  fe:0.5, na:59 },
  { id: 'tuna_red',       name: 'マグロ赤身(生)',      cal:125, p:26.4,f:1.4, c:0.1, fiber:0,   vitA:83,  vitC:2,  vitD:4.0, ca:5,   fe:1.1, na:49 },
  { id: 'mackerel',       name: 'さば(生)',            cal:247, p:20.7,f:16.8,c:0.3, fiber:0,   vitA:37,  vitC:1,  vitD:11.0,ca:6,   fe:1.2, na:110 },
  { id: 'sardine',        name: 'いわし(生)',          cal:217, p:19.2,f:13.9,c:0.2, fiber:0,   vitA:8,   vitC:0,  vitD:32.0,ca:74,  fe:2.1, na:100 },
  { id: 'shrimp',         name: 'えび(生)',            cal:97,  p:20.6,f:0.6, c:0.3, fiber:0,   vitA:3,   vitC:0,  vitD:0,   ca:50,  fe:0.7, na:170 },

  // 卵・乳製品
  { id: 'egg',            name: '鶏卵(全卵)',          cal:151, p:12.3,f:10.3,c:0.3, fiber:0,   vitA:150, vitC:0,  vitD:3.8, ca:51,  fe:1.8, na:146 },
  { id: 'milk',           name: '牛乳',                cal:67,  p:3.3, f:3.8, c:4.8, fiber:0,   vitA:38,  vitC:1,  vitD:0.3, ca:110, fe:0,   na:41 },
  { id: 'yogurt',         name: 'プレーンヨーグルト',  cal:62,  p:3.6, f:3.0, c:4.9, fiber:0,   vitA:33,  vitC:1,  vitD:0,   ca:120, fe:0,   na:48 },
  { id: 'cheese_proc',    name: 'プロセスチーズ',      cal:339, p:22.7,f:26.0,c:1.3, fiber:0,   vitA:260, vitC:0,  vitD:0.3, ca:630, fe:0.3, na:1100 },

  // 豆類
  { id: 'tofu_firm',      name: '木綿豆腐',            cal:73,  p:7.0, f:4.3, c:1.6, fiber:0.4, vitA:0,   vitC:0,  vitD:0,   ca:86,  fe:1.5, na:8 },
  { id: 'tofu_soft',      name: '絹ごし豆腐',          cal:56,  p:5.3, f:3.5, c:2.0, fiber:0.3, vitA:0,   vitC:0,  vitD:0,   ca:75,  fe:1.2, na:8 },
  { id: 'natto',          name: '納豆',                cal:200, p:16.5,f:10.0,c:12.1,fiber:6.7, vitA:0,   vitC:0,  vitD:0,   ca:90,  fe:3.3, na:2 },
  { id: 'edamame',        name: '枝豆(ゆで)',          cal:135, p:11.5,f:6.1, c:8.9, fiber:4.6, vitA:26,  vitC:15, vitD:0,   ca:76,  fe:2.5, na:1 },

  // 野菜
  { id: 'broccoli',       name: 'ブロッコリー(ゆで)',  cal:33,  p:3.9, f:0.4, c:5.2, fiber:4.3, vitA:81,  vitC:55, vitD:0,   ca:41,  fe:1.0, na:4 },
  { id: 'spinach',        name: 'ほうれん草(ゆで)',    cal:25,  p:2.6, f:0.5, c:4.0, fiber:3.6, vitA:540, vitC:19, vitD:0,   ca:69,  fe:0.9, na:10 },
  { id: 'carrot',         name: 'にんじん(生)',        cal:39,  p:0.7, f:0.2, c:9.3, fiber:2.8, vitA:720, vitC:6,  vitD:0,   ca:28,  fe:0.2, na:28 },
  { id: 'tomato',         name: 'トマト(生)',          cal:19,  p:0.7, f:0.1, c:4.7, fiber:1.0, vitA:45,  vitC:15, vitD:0,   ca:7,   fe:0.2, na:3 },
  { id: 'cabbage',        name: 'キャベツ(生)',        cal:23,  p:1.3, f:0.2, c:5.2, fiber:1.8, vitA:4,   vitC:41, vitD:0,   ca:43,  fe:0.3, na:5 },
  { id: 'onion',          name: 'たまねぎ(生)',        cal:37,  p:1.0, f:0.1, c:8.8, fiber:1.6, vitA:1,   vitC:8,  vitD:0,   ca:21,  fe:0.2, na:2 },
  { id: 'potato',         name: 'じゃがいも(蒸し)',   cal:84,  p:1.9, f:0.1, c:19.9,fiber:1.8, vitA:0,   vitC:18, vitD:0,   ca:5,   fe:0.4, na:2 },
  { id: 'sweet_potato',   name: 'さつまいも(蒸し)',   cal:131, p:1.2, f:0.2, c:33.1,fiber:2.8, vitA:4,   vitC:20, vitD:0,   ca:36,  fe:0.5, na:11 },
  { id: 'avocado',        name: 'アボカド',            cal:187, p:2.5, f:17.5,c:7.9, fiber:5.3, vitA:7,   vitC:15, vitD:0,   ca:9,   fe:0.7, na:7 },

  // 果物
  { id: 'banana',         name: 'バナナ',              cal:86,  p:1.1, f:0.2, c:22.5,fiber:1.1, vitA:5,   vitC:16, vitD:0,   ca:6,   fe:0.3, na:0 },
  { id: 'apple',          name: 'りんご(皮なし)',      cal:61,  p:0.1, f:0.2, c:16.2,fiber:1.4, vitA:2,   vitC:6,  vitD:0,   ca:4,   fe:0,   na:0 },
  { id: 'orange',         name: 'みかん',              cal:46,  p:0.7, f:0.1, c:12.0,fiber:1.0, vitA:84,  vitC:35, vitD:0,   ca:21,  fe:0.2, na:1 },

  // 油脂・調味料
  { id: 'olive_oil',      name: 'オリーブオイル',      cal:921, p:0,   f:100, c:0,   fiber:0,   vitA:0,   vitC:0,  vitD:0,   ca:1,   fe:0,   na:0 },
  { id: 'butter',         name: 'バター(有塩)',         cal:745, p:0.6, f:81.0,c:0.2, fiber:0,   vitA:520, vitC:0,  vitD:0.5, ca:15,  fe:0,   na:750 },

  // 加工食品・惣菜
  { id: 'onigiri_sake',   name: 'おにぎり(鮭)',        cal:179, p:5.5, f:1.8, c:36.2,fiber:0.5, vitA:9,   vitC:1,  vitD:3.0, ca:10,  fe:0.3, na:310 },
  { id: 'curry_rice',     name: 'カレーライス',        cal:182, p:5.5, f:5.8, c:27.8,fiber:1.5, vitA:20,  vitC:4,  vitD:0,   ca:26,  fe:0.7, na:580 },
  { id: 'ramen',          name: 'ラーメン(醤油)',      cal:191, p:8.0, f:5.7, c:26.1,fiber:1.0, vitA:5,   vitC:2,  vitD:0,   ca:25,  fe:0.8, na:740 },
  { id: 'hamburger_steak',name: 'ハンバーグステーキ',  cal:223, p:13.8,f:16.1,c:7.7, fiber:0.5, vitA:15,  vitC:2,  vitD:0.2, ca:28,  fe:1.5, na:390 },
  { id: 'miso_soup',      name: 'みそ汁',              cal:25,  p:1.7, f:0.9, c:3.1, fiber:1.0, vitA:5,   vitC:1,  vitD:0,   ca:30,  fe:0.5, na:560 },
  { id: 'gyoza',          name: '餃子(焼き)',          cal:223, p:9.7, f:10.1,c:24.1,fiber:1.4, vitA:10,  vitC:5,  vitD:0,   ca:34,  fe:1.0, na:440 },
  { id: 'sushi_salmon',   name: '寿司(サーモン1貫)',   cal:60,  p:4.8, f:2.0, c:6.6, fiber:0.1, vitA:3,   vitC:0,  vitD:6.0, ca:4,   fe:0.1, na:150 },
  { id: 'sushi_tuna',     name: '寿司(まぐろ1貫)',     cal:55,  p:6.1, f:0.4, c:7.1, fiber:0.1, vitA:18,  vitC:0,  vitD:1.0, ca:2,   fe:0.3, na:170 },
]
