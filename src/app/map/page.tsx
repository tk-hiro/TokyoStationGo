'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { fetchVisits, NotAuthenticatedError } from '@/lib/visits'
import type { VisitRow } from '@/lib/visits'
import { fetchTarget } from '@/lib/targets'
import type { TargetRow } from '@/lib/targets'
import { buildMapStations, TOTAL_STATIONS } from '@/lib/mapData'

// Leaflet は window に依存するため SSR しない（ssr: false は Client Component 内のみ可）
const StationMap = dynamic(() => import('@/components/map/StationMap'), {
  ssr: false,
  loading: () => <MapLoading />,
})

type FetchStatus = 'loading' | 'ready' | 'error'
type Filter = 'all' | 'visited' | 'unvisited'

const FILTER_LABELS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'すべて' },
  { key: 'visited', label: '訪問済み' },
  { key: 'unvisited', label: '未訪問' },
]

function MapLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full w-full items-center justify-center gap-3 text-sm text-zinc-500 dark:text-zinc-400"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200"
      />
      地図を読み込み中...
    </div>
  )
}

function MapPageInner() {
  const searchParams = useSearchParams()
  const stationParam = searchParams.get('station')
  const focusStationId = stationParam !== null ? Number(stationParam) : null

  const [status, setStatus] = useState<FetchStatus>('loading')
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [target, setTarget] = useState<TargetRow | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      // Layout が未ログインを弾くので通常発生しないが、念のため未ログインは空扱い
      fetchVisits().catch((err) => {
        if (err instanceof NotAuthenticatedError) return []
        throw err
      }),
      fetchTarget(),
    ])
      .then(([visitRows, targetRow]) => {
        if (cancelled) return
        setVisits(visitRows)
        setTarget(targetRow)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[map] データ取得失敗:', err)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const mapStations = useMemo(
    () =>
      buildMapStations(
        visits,
        target !== null ? Number(target.station_id) : null,
      ),
    [visits, target],
  )

  // フィルタ適用。目標駅は常に表示する
  const filteredStations = useMemo(() => {
    if (filter === 'all') return mapStations
    return mapStations.filter(
      (s) =>
        s.status === 'target' ||
        (filter === 'visited' ? s.status === 'visited' : s.status === 'unvisited'),
    )
  }, [mapStations, filter])

  const visitedCount = visits.length

  if (status === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center px-6">
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm font-medium text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-300"
        >
          データの取得に失敗しました。再読み込みしてください。
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return <MapLoading />
  }

  return (
    <>
      <StationMap stations={filteredStations} focusStationId={focusStationId} />

      {/* フィルタチップ（Leaflet のペインより手前に出すため z-[1000]） */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex items-start justify-between gap-2 px-3">
        <div className="pointer-events-auto ml-10 flex gap-1 rounded-full border border-zinc-200 bg-white/95 p-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900/95">
          {FILTER_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === key
                  ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
            <span aria-hidden="true">🏆</span> 制覇{' '}
            <span className="text-emerald-600 dark:text-emerald-400">
              {visitedCount}
            </span>
            <span className="mx-0.5 text-zinc-400">/</span>
            {TOTAL_STATIONS} 駅
          </span>
          <div
            role="progressbar"
            aria-valuenow={visitedCount}
            aria-valuemin={0}
            aria-valuemax={TOTAL_STATIONS}
            aria-label="駅の制覇率"
            className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${(visitedCount / TOTAL_STATIONS) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-[11px] text-zinc-600 shadow-md dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          次の目標駅
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]"
          />
          訪問済み
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full border border-zinc-400 bg-zinc-400/15"
          />
          未訪問
        </span>
      </div>
    </>
  )
}

export default function MapPage() {
  // useSearchParams を使うため Suspense 境界で包む
  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full">
      <Suspense fallback={<MapLoading />}>
        <MapPageInner />
      </Suspense>
    </div>
  )
}
