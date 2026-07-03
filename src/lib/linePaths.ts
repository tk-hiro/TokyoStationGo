import stationsData from '@/data/stations.json'
import type { Station } from '@/types/station'
import { getLineColor } from './lineColors'

const stations = stationsData as Station[]

export type LinePath = {
  id: number
  name: string
  color: string
  positions: [number, number][]
}

// 緯度経度の簡易距離（比較専用）。東京近辺なので equirectangular 近似で十分
function dist2(a: Station, b: Station): number {
  const dLat = a.lat - b.lat
  const dLng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)
  return dLat * dLat + dLng * dLng
}

function farthestFrom(p: Station, members: Station[]): Station {
  let best = p
  let maxD = -1
  for (const m of members) {
    const d = dist2(p, m)
    if (d > maxD) {
      maxD = d
      best = m
    }
  }
  return best
}

// データに路線内の駅順が無いため、最近傍を貪欲に辿って描画順を推定する。
// 起点は直径スイープ（適当な駅から最遠の駅）で選ぶ。曲がった路線でも
// 真の終端になりやすく、重心基準より端点間ジャンプが起きにくい
function orderStations(members: Station[]): Station[] {
  const start = farthestFrom(members[0], members)

  const remaining = new Set(members)
  remaining.delete(start)
  const ordered = [start]
  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1]
    let next: Station | null = null
    let best = Infinity
    for (const m of remaining) {
      const d = dist2(last, m)
      if (d < best) {
        best = d
        next = m
      }
    }
    ordered.push(next!)
    remaining.delete(next!)
  }
  return twoOpt(ordered)
}

// 2-opt: 経路の交差を区間反転で解消する（曲がりくねった路線で貪欲法が作る
// 不自然なショートカットの後始末）。駅数が少ないので総当たりで十分速い
function twoOpt(path: Station[]): Station[] {
  const p = [...path]
  const d = (a: Station, b: Station) => Math.sqrt(dist2(a, b))
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < p.length - 2; i++) {
      for (let j = i + 2; j < p.length - 1; j++) {
        const current = d(p[i], p[i + 1]) + d(p[j], p[j + 1])
        const swapped = d(p[i], p[j]) + d(p[i + 1], p[j + 1])
        if (swapped < current - 1e-9) {
          // i+1 〜 j を反転
          let lo = i + 1
          let hi = j
          while (lo < hi) {
            ;[p[lo], p[hi]] = [p[hi], p[lo]]
            lo++
            hi--
          }
          improved = true
        }
      }
    }
  }
  return p
}

// 環状線（山手線など）は末尾と先頭が隣接しているはずなので閉じる。
// 通過駅の多い急行系路線を誤って閉じないよう、端点間 約3km 以内も条件にする
const CLOSE_MAX_D2 = (3 / 111) ** 2 // 約3km を dist2 の単位に換算

function shouldClose(ordered: Station[]): boolean {
  if (ordered.length < 4) return false
  let maxSeg = 0
  for (let i = 1; i < ordered.length; i++) {
    maxSeg = Math.max(maxSeg, dist2(ordered[i - 1], ordered[i]))
  }
  const closing = dist2(ordered[ordered.length - 1], ordered[0])
  return closing <= maxSeg * 1.2 && closing <= CLOSE_MAX_D2
}

// 全路線の描画パス。モジュール読み込み時に一度だけ組み立てる
export const LINE_PATHS: LinePath[] = (() => {
  const byLine = new Map<number, { name: string; members: Station[] }>()
  for (const station of stations) {
    station.lines.forEach((lineId, i) => {
      let entry = byLine.get(lineId)
      if (!entry) {
        entry = { name: station.line_names[i], members: [] }
        byLine.set(lineId, entry)
      }
      entry.members.push(station)
    })
  }

  const paths: LinePath[] = []
  for (const [id, { name, members }] of byLine) {
    if (members.length < 2) continue
    const ordered = orderStations(members)
    const positions = ordered.map(
      (s) => [s.lat, s.lng] as [number, number],
    )
    if (shouldClose(ordered)) positions.push(positions[0])
    paths.push({ id, name, color: getLineColor(id), positions })
  }
  return paths
})()
