'use client'

import { useState } from 'react'
import { divIcon } from 'leaflet'
import { Marker, useMap, useMapEvents } from 'react-leaflet'
import { PLACE_LABELS } from '@/lib/placeLabels'

// 主要エリアの地名を常に日本語で表示するレイヤー。
// タイル由来のラベル（ズームアウト時に英語になる）の代わりに自前で描画する
export default function PlaceLabels() {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  })

  return (
    <>
      {PLACE_LABELS.filter((label) => zoom >= label.minZoom).map((label) => (
        <Marker
          key={label.name}
          position={[label.lat, label.lng]}
          interactive={false}
          keyboard={false}
          icon={divIcon({
            className: 'map-place-label',
            // minZoom 10 のラベルは主要ターミナルなので大きく表示する
            html: `<span class="${label.minZoom <= 10 ? 'map-place-label-major' : 'map-place-label-minor'}">${label.name}</span>`,
            iconSize: [0, 0],
          })}
        />
      ))}
    </>
  )
}
