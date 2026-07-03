'use client'

import 'leaflet/dist/leaflet.css'
import type { CircleMarker as LeafletCircleMarker } from 'leaflet'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { STATIONS_BOUNDS, type MapStation } from '@/lib/mapData'
import LineOverlay from './LineOverlay'
import PlaceLabels from './PlaceLabels'
import StationPopup from './StationPopup'

type Props = {
  stations: MapStation[]
  // 指定された駅を中心に表示し、ポップアップを自動で開く（/map?station=<id>）
  focusStationId: number | null
}

// 地名・道路ラベルの無い白地図タイル（CARTO basemap）。
// 情報量を駅マーカーだけに絞ってゲーム盤面のような見た目にする
const TILE_LIGHT =
  'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
const TILE_DARK =
  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

// マーカーの見た目。訪問済みは大きく発光させて「獲得済み」感を出し、
// 未訪問は薄いリングにして「未収集」感を出す（色はマイページの emerald に揃える）
const MARKER_STYLE: Record<
  MapStation['status'],
  {
    radius: number
    fill: string
    stroke: string
    weight: number
    fillOpacity: number
    className?: string
  }
> = {
  target: {
    radius: 11,
    fill: '#f59e0b',
    stroke: '#f59e0b',
    weight: 3,
    fillOpacity: 0.95,
    className: 'map-target-marker',
  },
  visited: {
    radius: 8,
    fill: '#10b981',
    stroke: '#ffffff',
    weight: 2.5,
    fillOpacity: 1,
    className: 'map-visited-marker',
  },
  unvisited: {
    radius: 4,
    fill: '#a1a1aa',
    stroke: '#a1a1aa',
    weight: 1.5,
    fillOpacity: 0.15,
  },
}

// 目標駅 > 訪問済み > 未訪問 の順で手前に描画する
const DRAW_ORDER: Record<MapStation['status'], number> = {
  unvisited: 0,
  visited: 1,
  target: 2,
}

export default function StationMap({ stations, focusStationId }: Props) {
  // このコンポーネントは ssr:false で読み込まれるため window に安全に触れる
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches

  const focusStation =
    focusStationId !== null
      ? (stations.find((s) => s.id === focusStationId) ?? null)
      : null

  const ordered = [...stations].sort(
    (a, b) => DRAW_ORDER[a.status] - DRAW_ORDER[b.status],
  )

  // フォーカス駅があればそこへズーム、なければ全駅が収まる範囲で表示
  const view = focusStation
    ? { center: [focusStation.lat, focusStation.lng] as [number, number], zoom: 14 }
    : { bounds: STATIONS_BOUNDS }

  return (
    <MapContainer
      {...view}
      scrollWheelZoom
      className="h-full w-full"
      attributionControl
      // 東京の全駅が入る範囲の外へはスクロール・ズームアウトできないよう固定する
      maxBounds={STATIONS_BOUNDS}
      maxBoundsViscosity={1.0}
      minZoom={10}
      maxZoom={17}
    >
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={prefersDark ? TILE_DARK : TILE_LIGHT}
        subdomains="abcd"
      />
      <LineOverlay />
      <PlaceLabels />
      {ordered.map((station) => {
        const style = MARKER_STYLE[station.status]
        const isFocused = station.id === focusStationId
        return (
          <CircleMarker
            key={station.id}
            center={[station.lat, station.lng]}
            radius={style.radius}
            pathOptions={{
              color: style.stroke,
              fillColor: style.fill,
              fillOpacity: style.fillOpacity,
              weight: style.weight,
              className: style.className,
            }}
            ref={
              isFocused
                ? (marker: LeafletCircleMarker | null) => {
                    // 地図の初期化が終わってから開かないと popup の位置がずれる
                    if (marker) setTimeout(() => marker.openPopup(), 400)
                  }
                : undefined
            }
          >
            <Popup>
              <StationPopup station={station} />
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
