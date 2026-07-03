'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import stationsData from '@/data/stations.json'
import type { Station } from '@/types/station'
// localStorage版（旧実装）はSupabaseへ移行のためコメントアウト
// import { loadCheckins, summarizeByStation } from '@/lib/checkins'
// import type { StationVisitSummary } from '@/lib/checkins'
import { fetchVisits, NotAuthenticatedError } from '@/lib/visits'
import type { VisitRow } from '@/lib/visits'
import { getLevelInfo } from '@/lib/level'

const stations = stationsData as Station[]

// 全駅数は仕様で 615 に固定
const TOTAL_STATIONS = 615
// const TOTAL_STATIONS = stations.length

// 路線名 → その路線の全駅 station_id 一覧（Set）。各路線の総駅数の算出と、
// 訪問済み駅との突合に使う。stations.json の line_names から事前に組み立てる。
const STATION_IDS_BY_LINE: ReadonlyMap<string, ReadonlySet<number>> = (() => {
  const map = new Map<string, Set<number>>()
  for (const s of stations) {
    for (const line of s.line_names) {
      let ids = map.get(line)
      if (!ids) {
        ids = new Set()
        map.set(line, ids)
      }
      ids.add(s.id)
    }
  }
  return map
})()

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

type FetchStatus = 'loading' | 'ready' | 'error' | 'unauthenticated'

export default function MyPage() {
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [visits, setVisits] = useState<VisitRow[]>([])

  // localStorage版（旧実装）はSupabaseへ移行のためコメントアウト
  // const [mounted, setMounted] = useState(false)
  // const [summaries, setSummaries] = useState<StationVisitSummary[]>([])
  // useEffect(() => {
  //   setSummaries(summarizeByStation(loadCheckins()))
  //   setMounted(true)
  // }, [])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage(null)
    fetchVisits()
      .then((rows) => {
        if (cancelled) return
        setVisits(rows)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof NotAuthenticatedError) {
          setStatus('unauthenticated')
          return
        }
        console.error('[mypage] visits 取得失敗:', err)
        setErrorMessage(
          err instanceof Error ? err.message : 'データの取得に失敗しました',
        )
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const checkedIn = visits.length
  const rate = TOTAL_STATIONS > 0 ? (checkedIn / TOTAL_STATIONS) * 100 : 0
  const isReady = status === 'ready'

  // 路線別の訪問済み駅数 / 全駅数。訪問済みが 1 駅以上の路線だけ、訪問数の多い順。
  const lineProgress = useMemo(() => {
    if (visits.length === 0) return []
    // Supabase の bigint 型は文字列で返ることがあるため Number で揃える
    const visitedIds = new Set(visits.map((v) => Number(v.station_id)))
    // DEBUG: 進捗が出ない原因切り分け用ログ
    console.log('[mypage debug] visited ids:', [...visitedIds])
    console.log(
      '[mypage debug] visit station_id raw types:',
      visits.map((v) => `${v.station_id} (${typeof v.station_id})`),
    )
    console.log('[mypage debug] station map size:', STATION_IDS_BY_LINE.size)
    console.log(
      '[mypage debug] sample station id:',
      stations[0]?.id,
      typeof stations[0]?.id,
    )
    const items: Array<{ lineName: string; visited: number; total: number }> = []
    for (const [lineName, stationIds] of STATION_IDS_BY_LINE) {
      let visited = 0
      for (const id of stationIds) {
        if (visitedIds.has(id)) visited += 1
      }
      if (visited > 0) {
        items.push({ lineName, visited, total: stationIds.size })
      }
    }
    console.log('[mypage debug] matched lines:', items.length, items)
    items.sort((a, b) => {
      if (b.visited !== a.visited) return b.visited - a.visited
      // 同数の場合は制覇率の高い順
      const ar = a.visited / a.total
      const br = b.visited / b.total
      return br - ar
    })
    return items
  }, [visits])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-3xl">
          マイページ
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          チェックインした駅の一覧
        </p>
      </header>

      {isReady && (
        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          {(() => {
            const info = getLevelInfo(checkedIn)
            return (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    Lv.{info.level}
                    <span className="ml-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                      {info.rankName}
                    </span>
                  </p>
                  {info.stationsToNext !== null && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      次のレベルまで あと{' '}
                      <span className="font-bold text-zinc-900 dark:text-zinc-50">
                        {info.stationsToNext}
                      </span>{' '}
                      駅
                    </p>
                  )}
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(info.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="次のレベルまでの進捗"
                  className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                >
                  <div
                    className="h-full rounded-full bg-amber-500 transition-[width] duration-500"
                    style={{ width: `${info.progress * 100}%` }}
                  />
                </div>
              </>
            )
          })()}
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              訪問済み駅数 ／ 全駅数
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {isReady ? checkedIn : '-'}
              <span className="mx-1 text-zinc-400 dark:text-zinc-500">／</span>
              {TOTAL_STATIONS}
              <span className="ml-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                駅
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">制覇率</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {isReady ? rate.toFixed(1) : '-'}
              <span className="ml-0.5 text-sm font-medium">%</span>
            </p>
          </div>
        </div>
      </section>

      {status === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200"
          />
          読み込み中...
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center dark:border-red-500/40 dark:bg-red-950/40"
        >
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            データの取得に失敗しました
          </p>
          {errorMessage && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </div>
      )}

      {status === 'unauthenticated' && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              ログインしてください
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              訪問記録を表示するにはログインが必要です
            </p>
          </div>
          <Link
            href="/login?next=/mypage"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            ログイン
          </Link>
        </div>
      )}

      {status === 'ready' && visits.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          まだチェックインした駅はありません
        </p>
      )}

      {status === 'ready' && visits.length > 0 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              路線別進捗
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {lineProgress.length > 0
                ? `訪問済み駅がある ${lineProgress.length} 路線`
                : '対象路線が見つかりませんでした（ログを確認してください）'}
            </p>
          </div>
          {lineProgress.length > 0 && (
          <ul className="flex flex-col gap-3">
            {lineProgress.map((p) => {
              const pct = p.total > 0 ? (p.visited / p.total) * 100 : 0
              const completed = p.visited === p.total
              return (
                <li key={p.lineName} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {p.lineName}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {p.visited}
                      </span>
                      <span className="mx-0.5 text-zinc-400 dark:text-zinc-500">
                        /
                      </span>
                      {p.total} 駅
                      <span className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400">
                        {pct.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${p.lineName} の制覇率`}
                    className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        completed
                          ? 'bg-emerald-500 dark:bg-emerald-400'
                          : 'bg-emerald-500/80 dark:bg-emerald-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          )}
        </section>
      )}

      {status === 'ready' && visits.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visits.map((v) => {
            const lines = v.line_name
              ? v.line_name.split('、').filter(Boolean)
              : []
            return (
              <li
                key={v.station_id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {v.station_name}
                  </p>
                  {lines.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {lines.map((line) => (
                        <li
                          key={line}
                          className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    初回: {dateFormatter.format(new Date(v.checked_in_at))}
                    <span className="mx-2 text-zinc-300 dark:text-zinc-600">
                      ／
                    </span>
                    最終: {dateFormatter.format(new Date(v.last_visited_at))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start sm:flex-col sm:items-end sm:self-auto">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {v.visit_count}回訪問
                  </span>
                  <Link
                    href={`/map?station=${v.station_id}`}
                    className="text-xs font-medium text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    地図で見る
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
