'use client'

import { useEffect } from 'react'
import { layerGroup, polyline, type Polyline } from 'leaflet'
import { useMap } from 'react-leaflet'
import { LINE_PATHS } from '@/lib/linePaths'

// 路線名ツールチップを出す最小ズーム。引きの表示では線が密集していて
// カーソルが常にどれかの線に乗ってしまい、路線名が出続けるため無効化する
const TOOLTIP_MIN_ZOOM = 12

// 全路線を色別のポリラインで描画する。
// ズームによるツールチップの付け外しで React と Leaflet の DOM 管理が
// 衝突する（removeChild エラー）ため、このレイヤーは Leaflet を直接使う
export default function LineOverlay() {
  const map = useMap()

  useEffect(() => {
    // 駅マーカー（overlayPane: zIndex 400）より必ず下に描画されるよう
    // 専用ペインを用意する
    if (!map.getPane('lineOverlay')) {
      const pane = map.createPane('lineOverlay')
      pane.style.zIndex = '350'
    }

    const polylines: Polyline[] = LINE_PATHS.map((line) =>
      polyline(line.positions, {
        pane: 'lineOverlay',
        color: line.color,
        weight: 3,
        opacity: 0.55,
        lineCap: 'round',
        lineJoin: 'round',
      }),
    )
    const group = layerGroup(polylines).addTo(map)

    let tooltipsBound = false
    const syncTooltips = () => {
      const show = map.getZoom() >= TOOLTIP_MIN_ZOOM
      if (show === tooltipsBound) return
      tooltipsBound = show
      polylines.forEach((pl, i) => {
        if (show) {
          pl.bindTooltip(LINE_PATHS[i].name, { sticky: true })
        } else {
          pl.unbindTooltip()
        }
      })
    }

    syncTooltips()
    map.on('zoomend', syncTooltips)

    return () => {
      map.off('zoomend', syncTooltips)
      group.remove()
    }
  }, [map])

  return null
}
