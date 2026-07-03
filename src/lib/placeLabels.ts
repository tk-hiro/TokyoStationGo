import stationsData from '@/data/stations.json'
import type { Station } from '@/types/station'

const stations = stationsData as Station[]

export type PlaceLabel = {
  name: string
  lat: number
  lng: number
  // このズームレベル以上で表示する
  minZoom: number
}

// 常時表示する主要エリア（ズーム10〜）
const TIER1 = [
  '東京',
  '新宿',
  '渋谷',
  '池袋',
  '上野',
  '品川',
  '吉祥寺',
  '立川',
  '八王子',
  '町田',
  '青梅',
  '北千住',
]

// ズームインしたら表示する中規模エリア（ズーム12〜）
const TIER2 = [
  '秋葉原',
  '銀座',
  '新橋',
  '六本木',
  '恵比寿',
  '目黒',
  '蒲田',
  '自由が丘',
  '二子玉川',
  '下北沢',
  '中野',
  '荻窪',
  '三鷹',
  '調布',
  '府中',
  '国分寺',
  '田無',
  '東村山',
  '福生',
  '高尾',
  '多摩センター',
  '練馬',
  '光が丘',
  '赤羽',
  '王子',
  '巣鴨',
  '高田馬場',
  '飯田橋',
  '錦糸町',
  '押上',
  '新小岩',
  '金町',
  '葛西',
  '豊洲',
]

// 表示名と駅データ上の名前が異なるもの（表示名 → 駅名）
const NAME_ALIASES: Record<string, string> = {
  多摩センター: '京王多摩センター',
  押上: '押上〈スカイツリー前〉',
}

// 駅名から座標を引いてラベルにする。データに無い駅名は黙って捨てる
function toLabels(names: string[], minZoom: number): PlaceLabel[] {
  const labels: PlaceLabel[] = []
  for (const name of names) {
    const stationName = NAME_ALIASES[name] ?? name
    const station = stations.find((s) => s.name === stationName)
    if (station) {
      labels.push({ name, lat: station.lat, lng: station.lng, minZoom })
    }
  }
  return labels
}

export const PLACE_LABELS: PlaceLabel[] = [
  ...toLabels(TIER1, 10),
  ...toLabels(TIER2, 12),
]
