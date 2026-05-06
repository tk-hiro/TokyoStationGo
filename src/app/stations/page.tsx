'use client'

import { useMemo, useState } from 'react'
import stationsData from '@/data/stations.json'
import type { Station } from '@/types/station'
import {
  ARRIVAL_RADIUS_M,
  calculateDistance,
  getCurrentPosition,
} from '@/lib/location'

type CheckinResult =
  | { kind: 'success'; distance: number }
  | { kind: 'too_far'; distance: number }
  | { kind: 'error'; message: string }

const stations = stationsData as Station[]

const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.round(m)}m`

export default function StationsPage() {
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, CheckinResult>>({})

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return stations
    return stations.filter((s) => s.name.includes(q))
  }, [query])

  const handleCheckin = async (station: Station) => {
    if (pendingId !== null) return
    setPendingId(station.id)
    setResults((prev) => {
      const next = { ...prev }
      delete next[station.id]
      return next
    })
    try {
      const pos = await getCurrentPosition()
      const distance = calculateDistance(
        pos.coords.latitude,
        pos.coords.longitude,
        station.lat,
        station.lng,
      )
      setResults((prev) => ({
        ...prev,
        [station.id]: {
          kind: distance <= ARRIVAL_RADIUS_M ? 'success' : 'too_far',
          distance,
        },
      }))
    } catch (err) {
      const message =
        err instanceof GeolocationPositionError
          ? err.code === err.PERMISSION_DENIED
            ? '位置情報の利用が許可されていません'
            : '位置情報を取得できませんでした'
          : err instanceof Error
            ? err.message
            : '位置情報を取得できませんでした'
      setResults((prev) => ({
        ...prev,
        [station.id]: { kind: 'error', message },
      }))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-3xl">
          駅一覧
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          全{stations.length}駅 / 表示 {filtered.length}駅
        </p>
      </header>

      <div className="sticky top-14 z-10 -mx-4 bg-zinc-50/90 px-4 py-3 backdrop-blur dark:bg-black/80 md:static md:top-auto md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-0 md:dark:bg-transparent">
        <label className="relative block">
          <span className="sr-only">駅名で検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="駅名で検索（例: 東京、新宿）"
            className="w-full rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          該当する駅が見つかりませんでした
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((station) => {
            const result = results[station.id]
            const isPending = pendingId === station.id
            const failed = !!result && result.kind !== 'success'
            return (
              <li
                key={station.id}
                className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-sm transition-colors sm:flex-row sm:items-center sm:justify-between ${
                  failed
                    ? 'border-red-200 bg-red-50 dark:border-red-500/40 dark:bg-red-950/40'
                    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {station.name}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {station.line_names.map((line) => (
                      <li
                        key={line}
                        className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                  {result && (
                    <p
                      className={`mt-2 text-xs font-medium ${
                        result.kind === 'success'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : result.kind === 'too_far'
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {result.kind === 'success'
                        ? `訪問成功！ (距離: ${formatDistance(result.distance)})`
                        : result.kind === 'too_far'
                          ? `距離が離れているためチェックインできませんでした。（距離: ${formatDistance(result.distance)}）`
                          : result.message}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleCheckin(station)}
                  disabled={isPending || pendingId !== null}
                  className="shrink-0 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? '取得中...' : 'チェックイン'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
