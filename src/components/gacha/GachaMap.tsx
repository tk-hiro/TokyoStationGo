'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
} from 'react-leaflet'
import stationsData from '@/data/stations.json'
import type { Station } from '@/types/station'
import { STATIONS_BOUNDS } from '@/lib/mapData'
import PlaceLabels from '@/components/map/PlaceLabels'
import {
  TILE_ATTRIBUTION,
  TILE_SUBDOMAINS,
  tileUrlForColorScheme,
} from '@/components/map/tiles'

// 確定時のズームレベル。深追いすると白地図に何も映らないので、
// 地名ラベルと周辺の駅ドットが見える「区レベル」の浅めに留める
const LANDED_ZOOM = 11

const stations = stationsData as Station[]

// 範囲モード（近く/おでかけ圏内）のときの抽選範囲。現在地と半径
export type SpinArea = {
  lat: number
  lng: number
  radiusM: number
}

type Props = {
  // ガチャ回転中にフォーカスが当たっている駅
  focus: Station | null
  // 確定した駅（回転中は null）。フォーカスリングがパルスに変わる
  landedStation: Station | null
  visitedIds: ReadonlySet<number>
  // 範囲モードならその範囲へズームし、点線の円で描く。null なら東京全体
  spinArea: SpinArea | null
}

// 確定時は浅めにズーム、範囲モード中はその範囲、それ以外は全体表示
function ViewController({
  landedStation,
  spinArea,
}: {
  landedStation: Station | null
  spinArea: SpinArea | null
}) {
  const map = useMap()
  useEffect(() => {
    if (landedStation) {
      // 範囲モードは既に範囲までズーム済み。固定ズームへ飛ばすと
      // かえってズームアウトに見えるので、その場の画角を維持する
      if (spinArea) return
      map.flyTo([landedStation.lat, landedStation.lng], LANDED_ZOOM, {
        duration: 1.2,
      })
    } else if (spinArea) {
      // 半径(m)を緯度経度の幅に換算して範囲全体が収まるようにする
      const dLat = spinArea.radiusM / 111320
      const dLng =
        spinArea.radiusM / (111320 * Math.cos((spinArea.lat * Math.PI) / 180))
      map.flyToBounds(
        [
          [spinArea.lat - dLat, spinArea.lng - dLng],
          [spinArea.lat + dLat, spinArea.lng + dLng],
        ],
        { duration: 0.8 },
      )
    } else {
      map.flyToBounds(STATIONS_BOUNDS, { duration: 0.6 })
    }
  }, [map, landedStation, spinArea])
  return null
}

// ガチャ演出用の地図。操作は受け付けない「盤面」として表示する
export default function GachaMap({
  focus,
  landedStation,
  visitedIds,
  spinArea,
}: Props) {
  return (
    <MapContainer
      bounds={STATIONS_BOUNDS}
      className="h-full w-full"
      attributionControl
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
    >
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={tileUrlForColorScheme()}
        subdomains={TILE_SUBDOMAINS}
      />
      <ViewController landedStation={landedStation} spinArea={spinArea} />
      <PlaceLabels />

      {/* 抽選範囲の円（範囲モードのみ） */}
      {spinArea && (
        <Circle
          center={[spinArea.lat, spinArea.lng]}
          radius={spinArea.radiusM}
          interactive={false}
          pathOptions={{
            color: '#f59e0b',
            weight: 2,
            dashArray: '6 6',
            fillColor: '#f59e0b',
            fillOpacity: 0.05,
          }}
        />
      )}

      {/* 全駅を小さなドットで敷く（訪問済みは emerald） */}
      {stations.map((s) => {
        const visited = visitedIds.has(s.id)
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={visited ? 3 : 2}
            interactive={false}
            pathOptions={{
              color: visited ? '#10b981' : '#a1a1aa',
              fillColor: visited ? '#10b981' : '#a1a1aa',
              fillOpacity: visited ? 0.8 : 0.4,
              weight: 0,
            }}
          />
        )
      })}

      {/* フォーカスリング。回転中は駅から駅へ飛び、確定でパルスする */}
      {focus && (
        <CircleMarker
          center={[focus.lat, focus.lng]}
          radius={landedStation ? 16 : 12}
          interactive={false}
          pathOptions={{
            color: '#f59e0b',
            fillColor: '#f59e0b',
            fillOpacity: landedStation ? 0.55 : 0.35,
            weight: 3,
            className: landedStation ? 'map-target-marker' : undefined,
          }}
        />
      )}
    </MapContainer>
  )
}
