'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import stationsData from '@/data/stations.json'
import {
  CATEGORY_LABELS,
  TITLES,
  type TitleCategory,
  type TitleDef,
} from '@/data/titles'
import type { Station } from '@/types/station'
import { fetchVisits, NotAuthenticatedError } from '@/lib/visits'
import type { VisitRow } from '@/lib/visits'
import { fetchOwnedTitles, syncTitles } from '@/lib/titles'

const stations = stationsData as Station[]

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

const CATEGORY_ORDER: TitleCategory[] = [
  'milestone',
  'line',
  'special',
  'streak',
]

type FetchStatus = 'loading' | 'ready' | 'error' | 'unauthenticated'

// 進捗表示できる条件（総駅数・路線制覇）の「いま何個目か」を返す
function progressOf(
  title: TitleDef,
  visitedIds: ReadonlySet<number>,
): { current: number; goal: number } | null {
  const c = title.condition
  if (c.kind === 'total') {
    return { current: Math.min(visitedIds.size, c.count), goal: c.count }
  }
  if (c.kind === 'line') {
    const members = stations.filter((s) => s.lines.includes(c.lineId))
    const visited = members.filter((s) => visitedIds.has(s.id)).length
    return { current: visited, goal: members.length }
  }
  return null
}

export default function TitlesPage() {
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [earnedAt, setEarnedAt] = useState<Map<string, string>>(new Map())
  const [activeCategory, setActiveCategory] = useState<TitleCategory>('milestone')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const visitRows = await fetchVisits()
        // 過去の訪問で条件を満たしている称号をここで遡って付与する
        await syncTitles(visitRows)
        const owned = await fetchOwnedTitles()
        if (cancelled) return
        setVisits(visitRows)
        setEarnedAt(new Map(owned.map((t) => [t.title_id, t.earned_at])))
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        if (err instanceof NotAuthenticatedError) {
          setStatus('unauthenticated')
          return
        }
        console.error('[titles] データ取得失敗:', err)
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visitedIds = useMemo(
    () => new Set(visits.map((v) => Number(v.station_id))),
    [visits],
  )

  const earnedCount = TITLES.filter((t) => earnedAt.has(t.id)).length

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-3xl">
          達成目録
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {status === 'ready'
            ? `${earnedCount} / ${TITLES.length} 個獲得`
            : '駅を訪れて称号を集めよう'}
        </p>
      </header>

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
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-300"
        >
          データの取得に失敗しました。再読み込みしてください。
        </p>
      )}

      {status === 'unauthenticated' && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            ログインしてください
          </p>
          <Link
            href="/login?next=/titles"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            ログイン
          </Link>
        </div>
      )}

      {status === 'ready' && (
        <>
          {/* 中分類のタブ切り替え */}
          <div
            role="tablist"
            aria-label="達成目録の分類"
            className="flex gap-1 overflow-x-auto rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {CATEGORY_ORDER.map((category) => {
              const active = category === activeCategory
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCategory(category)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                      : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              )
            })}
          </div>

          <section role="tabpanel" className="flex flex-col gap-3">
              {(() => {
                const titles = TITLES.filter(
                  (t) => t.category === activeCategory,
                )
                const earned = titles.filter((t) => earnedAt.has(t.id)).length
                return (
                  <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    達成{' '}
                    <span className="font-bold text-zinc-900 dark:text-zinc-50">
                      {earned}
                    </span>{' '}
                    / {titles.length}
                  </p>
                )
              })()}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {TITLES.filter((t) => t.category === activeCategory).map((title) => {
                  const earnedDate = earnedAt.get(title.id)
                  const progress = earnedDate
                    ? null
                    : progressOf(title, visitedIds)
                  return (
                    <li
                      key={title.id}
                      className={`flex flex-col gap-1.5 rounded-2xl border p-4 transition-colors ${
                        earnedDate
                          ? 'border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-950/30'
                          : 'border-zinc-200 bg-white opacity-70 dark:border-zinc-800 dark:bg-zinc-900'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`text-2xl ${earnedDate ? '' : 'grayscale opacity-50'}`}
                      >
                        {title.icon}
                      </span>
                      <p
                        className={`text-sm font-bold ${
                          earnedDate
                            ? 'text-zinc-900 dark:text-zinc-50'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {title.name}
                      </p>
                      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {title.description}
                      </p>
                      {earnedDate ? (
                        <p className="mt-auto text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          ✓ {dateFormatter.format(new Date(earnedDate))} 獲得
                        </p>
                      ) : (
                        progress && (
                          <p className="mt-auto text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                            {progress.current} / {progress.goal}
                          </p>
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
          </section>
        </>
      )}
    </div>
  )
}
