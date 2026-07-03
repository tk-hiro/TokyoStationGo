import stationsData from './stations.json'
import type { Station } from '@/types/station'

const stations = stationsData as Station[]

// 称号の達成条件。宣言的に持ち、判定は src/lib/titles.ts のエンジンが行う
export type TitleCondition =
  | { kind: 'total'; count: number } // 累計訪問駅数
  | { kind: 'line'; lineId: number } // 路線の全駅制覇
  | { kind: 'lineGroup'; lineIds: number[] } // 複数路線すべて制覇
  | { kind: 'sameStationVisits'; count: number } // 同じ駅への訪問回数
  | { kind: 'stationsInOneDay'; count: number } // 1日に新規チェックインした駅数
  | { kind: 'hubStation'; minLines: number } // 乗り入れ路線数の多い駅を制覇
  | { kind: 'extremes' } // 東西南北の果ての駅をすべて制覇
  | { kind: 'timeOfDay'; beforeHour?: number; afterHour?: number } // 早朝/深夜チェックイン
  | { kind: 'streakWeeks'; weeks: number } // 連続週チェックイン
  | { kind: 'targetSameDay' } // 抽選したその日に目標駅へ到達（チェックイン時のみ判定）

export type TitleCategory = 'milestone' | 'line' | 'special' | 'streak'

export type TitleDef = {
  id: string
  name: string
  description: string
  icon: string
  category: TitleCategory
  condition: TitleCondition
}

// ---- ① 総駅数マイルストーン ----------------------------------------

const MILESTONES: Array<{ count: number; name: string; icon: string }> = [
  { count: 1, name: '改札デビュー', icon: '🐣' },
  { count: 5, name: 'きまぐれ途中下車', icon: '🚶' },
  { count: 10, name: '沿線ぶらり旅', icon: '🎒' },
  { count: 25, name: '定期券の外側へ', icon: '🎫' },
  { count: 50, name: '休日が電車に消える', icon: '📅' },
  { count: 100, name: 'ついに三桁', icon: '💯' },
  { count: 200, name: '路線図が頭に入っている', icon: '🧠' },
  { count: 300, name: '東京の半分は庭', icon: '🏡' },
  { count: 400, name: '駅員に顔を覚えられがち', icon: '👮' },
  { count: 500, name: '交通費が経費で落ちない', icon: '💸' },
  { count: 600, name: 'あと15駅で伝説', icon: '⏳' },
  { count: 615, name: '生ける路線図・東京全駅制覇', icon: '👑' },
]

const milestoneTitles: TitleDef[] = MILESTONES.map((m) => ({
  id: `total-${m.count}`,
  name: m.name,
  description: `累計 ${m.count} 駅にチェックイン`,
  icon: m.icon,
  category: 'milestone',
  condition: { kind: 'total', count: m.count },
}))

// ---- ② 路線制覇（81路線ぶん自動生成 + 主要路線は特別名） ------------

// 特別な名前を持つ路線（それ以外は「○○コンプ！」形式で自動生成）
const SPECIAL_LINE_NAMES: Record<number, { name: string; icon: string }> = {
  11302: { name: 'ぐるっと一周、山手線', icon: '🍀' },
  11312: { name: '中央特快、風になる', icon: '🌪️' },
  11332: { name: '京浜東北、縦断の証', icon: '📏' },
  99301: { name: '地底6階の冒険者', icon: '⛏️' }, // 大江戸線は深い
  99305: { name: 'ちんちん電車の常連', icon: '🛎️' },
  26007: { name: '世田谷の路地裏マスター', icon: '🐈' },
  24006: { name: '井の頭の風を知る者', icon: '🌳' },
  99311: { name: '未来都市の観光大使', icon: '🌉' },
  99336: { name: '空飛ぶ通勤者', icon: '🛫' },
  28002: { name: '真っ赤な地下迷路を抜けて', icon: '🌀' },
}

// 路線ID → { 路線名, 駅数 } を駅データから組み立てる
const lineInfo = (() => {
  const map = new Map<number, { name: string; count: number }>()
  for (const s of stations) {
    s.lines.forEach((id, i) => {
      const entry = map.get(id)
      if (entry) {
        entry.count += 1
      } else {
        map.set(id, { name: s.line_names[i], count: 1 })
      }
    })
  }
  return map
})()

const lineTitles: TitleDef[] = [...lineInfo.entries()]
  // 1駅しかない路線は「制覇」にならないので除外
  .filter(([, info]) => info.count >= 2)
  .sort((a, b) => a[0] - b[0])
  .map(([lineId, info]) => {
    const special = SPECIAL_LINE_NAMES[lineId]
    return {
      id: `line-${lineId}`,
      name: special?.name ?? `${info.name}コンプ！`,
      description: `${info.name}の全 ${info.count} 駅にチェックイン`,
      icon: special?.icon ?? '🚃',
      category: 'line' as const,
      condition: { kind: 'line' as const, lineId },
    }
  })

// ---- ③ 特殊条件 ------------------------------------------------------

const specialTitles: TitleDef[] = [
  {
    id: 'day-3',
    name: '今日は乗り放題気分',
    description: '1日で新しい駅 3 駅にチェックイン',
    icon: '🎡',
    category: 'special',
    condition: { kind: 'stationsInOneDay', count: 3 },
  },
  {
    id: 'day-5',
    name: '弾丸トラベラー',
    description: '1日で新しい駅 5 駅にチェックイン',
    icon: '💨',
    category: 'special',
    condition: { kind: 'stationsInOneDay', count: 5 },
  },
  {
    id: 'day-10',
    name: 'もはや山手線ゲーム',
    description: '1日で新しい駅 10 駅にチェックイン',
    icon: '⚡',
    category: 'special',
    condition: { kind: 'stationsInOneDay', count: 10 },
  },
  {
    id: 'target-same-day',
    name: '引いたからには行く',
    description: '抽選したその日のうちに目標駅へ到達',
    icon: '🎯',
    category: 'special',
    condition: { kind: 'targetSameDay' },
  },
  {
    id: 'regular-3',
    name: '顔なじみ',
    description: '同じ駅に 3 回チェックイン',
    icon: '☕',
    category: 'special',
    condition: { kind: 'sameStationVisits', count: 3 },
  },
  {
    id: 'regular-5',
    name: '常連さん',
    description: '同じ駅に 5 回チェックイン',
    icon: '🍜',
    category: 'special',
    condition: { kind: 'sameStationVisits', count: 5 },
  },
  {
    id: 'regular-10',
    name: '住民票そこに移せば？',
    description: '同じ駅に 10 回チェックイン',
    icon: '🏠',
    category: 'special',
    condition: { kind: 'sameStationVisits', count: 10 },
  },
  {
    id: 'hub-8',
    name: '巨大ダンジョン攻略',
    description: '8 路線以上が乗り入れる駅にチェックイン',
    icon: '🗝️',
    category: 'special',
    condition: { kind: 'hubStation', minLines: 8 },
  },
  {
    id: 'extremes',
    name: '東京の四隅、行ってきた',
    description: '東京都の最東端・最西端・最南端・最北端の駅をすべて制覇',
    icon: '🧭',
    category: 'special',
    condition: { kind: 'extremes' },
  },
  {
    id: 'monorail',
    name: '地に足つかない人',
    description: '多摩モノレールと東京モノレールを両方制覇',
    icon: '🚝',
    category: 'special',
    condition: { kind: 'lineGroup', lineIds: [99334, 99336] },
  },
  {
    id: 'tram',
    name: '都会のスローライフ',
    description: '都電荒川線と東急世田谷線を両方制覇',
    icon: '🐢',
    category: 'special',
    condition: { kind: 'lineGroup', lineIds: [99305, 26007] },
  },
  {
    id: 'early-bird',
    name: '始発ガチ勢',
    description: '朝 5 時前にチェックイン',
    icon: '🌅',
    category: 'special',
    condition: { kind: 'timeOfDay', beforeHour: 5 },
  },
  {
    id: 'night-owl',
    name: '終電スレスレ族',
    description: '23 時以降にチェックイン',
    icon: '🦉',
    category: 'special',
    condition: { kind: 'timeOfDay', afterHour: 23 },
  },
]

// ---- ④ 継続系 --------------------------------------------------------

const streakTitles: TitleDef[] = [
  {
    id: 'streak-2',
    name: 'おでかけが習慣に',
    description: '2 週連続でチェックイン',
    icon: '🔥',
    category: 'streak',
    condition: { kind: 'streakWeeks', weeks: 2 },
  },
  {
    id: 'streak-4',
    name: '雨にも負けず',
    description: '4 週連続でチェックイン',
    icon: '☔',
    category: 'streak',
    condition: { kind: 'streakWeeks', weeks: 4 },
  },
  {
    id: 'streak-8',
    name: '鉄の意志',
    description: '8 週連続でチェックイン',
    icon: '🛡️',
    category: 'streak',
    condition: { kind: 'streakWeeks', weeks: 8 },
  },
]

export const TITLES: TitleDef[] = [
  ...milestoneTitles,
  ...lineTitles,
  ...specialTitles,
  ...streakTitles,
]

export const TITLES_BY_ID: ReadonlyMap<string, TitleDef> = new Map(
  TITLES.map((t) => [t.id, t]),
)

export const CATEGORY_LABELS: Record<TitleCategory, string> = {
  milestone: '駅制覇',
  line: '路線制覇',
  special: 'チャレンジ',
  streak: 'Weekly',
}
