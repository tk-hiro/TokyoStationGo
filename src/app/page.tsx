'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import stationsData from '@/data/stations.json'
import type { Station } from '@/types/station'
import {
  ARRIVAL_RADIUS_M,
  calculateDistance,
  getCurrentPosition,
} from '@/lib/location'
import { addCheckin } from '@/lib/checkins'
import { fetchVisits, recordVisit } from '@/lib/visits'
import { clearTarget, fetchTarget, saveTarget } from '@/lib/targets'
import type { TargetRow } from '@/lib/targets'
import { syncTitles } from '@/lib/titles'
import type { TitleDef } from '@/data/titles'

type CheckinResult =
  | { kind: 'success'; distance: number }
  | { kind: 'too_far'; distance: number }
  | { kind: 'error'; message: string }

const stations = stationsData as Station[]

// ローカルタイムで同じ日付かどうか（「引いたからには行く」称号の判定用）
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// 抽選中の表示間隔(ms)。最初は速く、徐々に遅くしてリール風に減速させる
const SPIN_SCHEDULE = [
  45, 45, 45, 45, 45, 45, 50, 50, 50, 55,
  60, 70, 80, 95, 115, 140, 175, 220, 280, 360, 460,
]

export default function Home() {
  const [picked, setPicked] = useState<Station | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null)
  // 「引いたからには行く」称号の判定に使う目標駅の記録（drawn_at 付き）
  const [targetRow, setTargetRow] = useState<TargetRow | null>(null)
  // 直前のチェックインで新しく獲得した称号（獲得演出用）
  const [earnedTitles, setEarnedTitles] = useState<TitleDef[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // リール1コマごとに増やして key に使い、CSS アニメーションを再発火させる
  const [tick, setTick] = useState(0)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // 保存済みの目標駅（前回の抽選結果）があれば復元する。
  // 抽選中・抽選済みの表示は上書きしない（prev ?? で現状維持）。
  useEffect(() => {
    let cancelled = false
    fetchTarget().then((target) => {
      if (cancelled || !target) return
      const station = stations.find((s) => s.id === Number(target.station_id))
      if (!station) return
      setTargetRow(target)
      setPicked((prev) => prev ?? station)
      setDisplayName((prev) => prev ?? station.name)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const drawStation = () => {
    if (isSpinning) return

    setPicked(null)
    setCheckinResult(null)
    setEarnedTitles([])
    setIsSpinning(true)

    const finalStation = stations[Math.floor(Math.random() * stations.length)]
    let step = 0
    let lastIdx = -1

    const tick = () => {
      if (step < SPIN_SCHEDULE.length) {
        // 直前と同じ駅は避けて視覚的な変化をはっきりさせる
        let idx = Math.floor(Math.random() * stations.length)
        if (idx === lastIdx) idx = (idx + 1) % stations.length
        lastIdx = idx
        setTick((t) => t + 1)
        setDisplayName(stations[idx].name)
        timerRef.current = setTimeout(tick, SPIN_SCHEDULE[step++])
      } else {
        setTick((t) => t + 1)
        setDisplayName(finalStation.name)
        setPicked(finalStation)
        setIsSpinning(false)
        // 抽選結果を「次に行く駅」として保存（未ログイン時は内部でスキップ）
        void saveTarget(finalStation)
        // 「引いたからには行く」判定用に抽選日時をローカルにも控えておく
        setTargetRow({
          station_id: finalStation.id,
          station_name: finalStation.name,
          line_name: finalStation.line_names.join('、'),
          drawn_at: new Date().toISOString(),
        })
      }
    }
    tick()
  }

  const handleCheckin = async () => {
    if (!picked || isCheckingIn) return
    setIsCheckingIn(true)
    setCheckinResult(null)
    try {
      const pos = await getCurrentPosition()
      const distance = calculateDistance(
        pos.coords.latitude,
        pos.coords.longitude,
        picked.lat,
        picked.lng,
      )
      const success = distance <= ARRIVAL_RADIUS_M
      setCheckinResult({
        kind: success ? 'success' : 'too_far',
        distance,
      })
      if (success) {
        addCheckin(picked, distance)
        // 「引いたからには行く」: 抽選したその日のうちに目標駅へ到達したか
        const targetSameDay =
          targetRow !== null &&
          Number(targetRow.station_id) === picked.id &&
          isSameLocalDay(new Date(targetRow.drawn_at), new Date())

        // visits へ保存してから称号を判定する（順序が重要）
        await recordVisit(picked)
        void clearTarget(picked.id) // 目標駅に到達したので記録をクリア
        setTargetRow(null)

        try {
          const visits = await fetchVisits()
          const newTitles = await syncTitles(visits, { targetSameDay })
          setEarnedTitles(newTitles)
        } catch (titleErr) {
          // 称号の付与に失敗してもチェックイン自体は成功として扱う
          console.error('[titles] チェックイン後の称号判定に失敗:', titleErr)
        }
      }
    } catch (err) {
      const message =
        err instanceof GeolocationPositionError
          ? err.code === err.PERMISSION_DENIED
            ? '位置情報の利用が許可されていません'
            : '位置情報を取得できませんでした'
          : err instanceof Error
            ? err.message
            : '位置情報を取得できませんでした'
      setCheckinResult({ kind: 'error', message })
    } finally {
      setIsCheckingIn(false)
    }
  }

  const formatDistance = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.round(m)}m`

  return (
    <div className="flex flex-1 flex-col items-center justify-center font-sans">
      <div className="flex w-full max-w-xl flex-col items-center gap-10 px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          TokyoStationGo
        </h1>

        <button
          type="button"
          onClick={drawStation}
          disabled={isSpinning}
          className="rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-all hover:bg-zinc-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isSpinning ? '抽選中...' : picked ? 'もう一度抽選する' : '駅を抽選する'}
        </button>

        <div className="flex w-full flex-col items-center gap-6">
          <section
            className={`w-full overflow-hidden rounded-2xl border px-6 py-8 text-center transition-colors ${
              checkinResult && checkinResult.kind !== 'success'
                ? 'border-red-200 bg-red-50 dark:border-red-500/40 dark:bg-red-950/40'
                : picked
                  ? 'border-green-300 bg-green-50 dark:border-green-500/60 dark:bg-green-950/40'
                  : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
            }`}
            style={picked ? { animation: 'reel-glow 1.4s ease-out 1' } : undefined}
          >

            <div className="relative mx-auto mt-3 flex h-16 items-center justify-center overflow-hidden">
              {displayName ? (
                <span
                  key={tick}
                  className="block text-3xl font-semibold text-zinc-900 will-change-transform dark:text-zinc-50"
                  style={{
                    animation: isSpinning
                      ? 'reel-tick 80ms ease-out'
                      : 'reel-land 600ms cubic-bezier(0.2, 1.6, 0.4, 1)',
                  }}
                >
                  {displayName}
                </span>
              ) : (
                <span className="text-2xl tracking-widest text-zinc-300 dark:text-zinc-700">
                  ？？？
                </span>
              )}
              {/* リール上下のフェードマスクで奥行きを演出 */}
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b to-transparent ${
                  checkinResult && checkinResult.kind !== 'success'
                    ? 'from-red-50 dark:from-red-950/40'
                    : picked
                      ? 'from-green-50 dark:from-green-950/40'
                      : 'from-white dark:from-zinc-900'
                }`}
              />
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t to-transparent ${
                  checkinResult && checkinResult.kind !== 'success'
                    ? 'from-red-50 dark:from-red-950/40'
                    : picked
                      ? 'from-green-50 dark:from-green-950/40'
                      : 'from-white dark:from-zinc-900'
                }`}
              />
            </div>
            {picked && !isSpinning && (
              <div style={{ animation: 'lines-fade-in 450ms ease-out both' }}>
                <ul className="mt-5 flex flex-wrap justify-center gap-2">
                  {picked.line_names.map((line) => (
                    <li
                      key={line}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/map?station=${picked.id}`}
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span aria-hidden="true">🗺️</span>
                  マップで位置を確認する
                </Link>
              </div>
            )}
          </section>

          {picked && !isSpinning && (
            <div
              className="flex flex-col items-center gap-3"
              style={{ animation: 'lines-fade-in 450ms ease-out both' }}
            >
              <button
                type="button"
                onClick={handleCheckin}
                disabled={isCheckingIn}
                className="rounded-full bg-emerald-600 px-10 py-4 text-base font-semibold text-white shadow-md transition-all hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCheckingIn ? '位置情報を取得中...' : 'チェックイン'}
              </button>
              {checkinResult && (
                <p
                  className={`text-sm font-medium ${
                    checkinResult.kind === 'success'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : checkinResult.kind === 'too_far'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {checkinResult.kind === 'success'
                    ? `訪問成功！ (距離: ${formatDistance(checkinResult.distance)})`
                    : checkinResult.kind === 'too_far'
                      ? `距離が離れているためチェックインできませんでした。（距離: ${formatDistance(checkinResult.distance)}）`
                      : checkinResult.message}
                </p>
              )}

              {earnedTitles.length > 0 && (
                <div
                  className="flex w-full flex-col items-center gap-2"
                  style={{ animation: 'lines-fade-in 450ms ease-out both' }}
                >
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    🎉 新しい称号を獲得！
                  </p>
                  <ul className="flex w-full flex-col gap-2">
                    {earnedTitles.map((title) => (
                      <li
                        key={title.id}
                        className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/50 dark:bg-amber-950/30"
                        style={{ animation: 'reel-glow 1.4s ease-out 1' }}
                      >
                        <span aria-hidden="true" className="text-2xl">
                          {title.icon}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                            {title.name}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {title.description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/titles"
                    className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    称号コレクションを見る
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
