import stationsData from '@/data/stations.json'
import type { Station } from '@/types/station'
import type { VisitRow } from './visits'

const stations = stationsData as Station[]

export type StationStatus = 'visited' | 'unvisited' | 'target'

// 地図描画用の駅。訪問状態と、訪問済みならその記録を持つ
export type MapStation = Station & {
  status: StationStatus
  visit?: VisitRow
}

// 全615駅を訪問記録・目標駅と突合して MapStation に変換する。
// Supabase の bigint は数値型が揺れることがあるため Number で揃える。
export function buildMapStations(
  visits: VisitRow[],
  targetStationId: number | null,
): MapStation[] {
  const visitByStationId = new Map(visits.map((v) => [Number(v.station_id), v]))

  return stations.map((station) => {
    const visit = visitByStationId.get(station.id)
    const status: StationStatus =
      targetStationId !== null && station.id === targetStationId
        ? 'target'
        : visit
          ? 'visited'
          : 'unvisited'
    return { ...station, status, visit }
  })
}

// 全駅を含む地図の初期表示範囲 [[南西], [北東]]。少し余白を持たせる
export const STATIONS_BOUNDS: [[number, number], [number, number]] = (() => {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const s of stations) {
    if (s.lat < minLat) minLat = s.lat
    if (s.lat > maxLat) maxLat = s.lat
    if (s.lng < minLng) minLng = s.lng
    if (s.lng > maxLng) maxLng = s.lng
  }
  const pad = 0.02
  return [
    [minLat - pad, minLng - pad],
    [maxLat + pad, maxLng + pad],
  ]
})()

export const TOTAL_STATIONS = stations.length
