'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
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
import {
  consumeDraw,
  getRemainingDraws,
  refillDraws,
} from '@/lib/drawLimit'
import type { SpinArea } from '@/components/gacha/GachaMap'

type CheckinResult =
  | { kind: 'success'; distance: number }
  | { kind: 'too_far'; distance: number }
  | { kind: 'error'; message: string }

const stations = stationsData as Station[]

// 難易度: 現在地からの距離で抽選対象を絞る
type Difficulty = 'near' | 'outing' | 'expedition'

const DIFFICULTIES: Array<{
  key: Difficulty
  label: string
  detail: string
  icon: string
  radiusM: number | null
}> = [
  { key: 'near', label: '近くの駅から', detail: '5km以内', icon: '🚶', radiusM: 5000 },
  { key: 'outing', label: 'おでかけ圏内から', detail: '15km以内', icon: '🚃', radiusM: 15000 },
  { key: 'expedition', label: '東京中どこでも', detail: '制限なし', icon: '🧳', radiusM: null },
]

// ローカルタイムで同じ日付かどうか（「引いたからには行く」称号の判定用）
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Leaflet はブラウザ専用なのでガチャ演出マップは SSR しない
const GachaMap = dynamic(() => import('@/components/gacha/GachaMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
      マップを読み込み中...
    </div>
  ),
})

// フォーカスが駅から駅へ飛ぶ間隔(ms)。最初は速く、徐々に遅くして着地させる（合計 約7秒）
const SPIN_SCHEDULE = [
  140, 140, 140, 140, 140, 150, 150, 160, 160, 170,
  180, 190, 200, 220, 240, 260, 290, 320, 360, 410,
  470, 540, 620, 720,
]

export default function Home() {
  const [picked, setPicked] = useState<Station | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  // ガチャ回転中にマップ上でフォーカスが当たっている駅
  const [focusStation, setFocusStation] = useState<Station | null>(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null)
  // 「引いたからには行く」称号の判定に使う目標駅の記録（drawn_at 付き）
  const [targetRow, setTargetRow] = useState<TargetRow | null>(null)
  // 直前のチェックインで新しく獲得した称号（獲得演出用）
  const [earnedTitles, setEarnedTitles] = useState<TitleDef[]>([])
  // 抽選の条件設定と残り回数
  const [unvisitedOnly, setUnvisitedOnly] = useState(true)
  const [difficulty, setDifficulty] = useState<Difficulty>('expedition')
  const [remainingDraws, setRemainingDraws] = useState<number | null>(null)
  const [visitedIds, setVisitedIds] = useState<ReadonlySet<number>>(new Set())
  const [drawError, setDrawError] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  // 範囲モード（近く/おでかけ圏内）の抽選範囲。地図のズームと円の描画に使う
  const [spinArea, setSpinArea] = useState<SpinArea | null>(null)
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
      setFocusStation((prev) => prev ?? station)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 残り抽選回数（localStorage）と訪問済み駅（未訪問限定抽選用）を読み込む
  useEffect(() => {
    let cancelled = false
    fetchVisits()
      .then((rows) => {
        if (cancelled) return
        setVisitedIds(new Set(rows.map((v) => Number(v.station_id))))
      })
      .catch((err) => {
        console.error('[home] 訪問記録の取得に失敗:', err)
      })
      .finally(() => {
        if (cancelled) return
        // localStorage は SSR に無いので、マウント後のこのタイミングで読む
        setRemainingDraws(getRemainingDraws())
      })
    return () => {
      cancelled = true
    }
  }, [])

  const drawStation = async () => {
    if (isSpinning || isLocating) return
    setDrawError(null)

    if (remainingDraws !== null && remainingDraws <= 0) {
      setDrawError(
        '今日のガチャを使い切りました。チェックイン成功で回復します！',
      )
      return
    }

    // 抽選条件で候補を絞り込む
    let candidates = unvisitedOnly
      ? stations.filter((s) => !visitedIds.has(s.id))
      : stations

    const radiusM = DIFFICULTIES.find((d) => d.key === difficulty)?.radiusM
    let nextSpinArea: SpinArea | null = null
    if (radiusM != null) {
      setIsLocating(true)
      try {
        const pos = await getCurrentPosition()
        nextSpinArea = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radiusM,
        }
        candidates = candidates.filter(
          (s) =>
            calculateDistance(
              pos.coords.latitude,
              pos.coords.longitude,
              s.lat,
              s.lng,
            ) <= radiusM,
        )
      } catch {
        setDrawError(
          '位置情報を取得できませんでした。「東京中どこでも」なら位置情報なしで回せます。',
        )
        return
      } finally {
        setIsLocating(false)
      }
    }

    if (candidates.length === 0) {
      setDrawError(
        unvisitedOnly
          ? 'この条件の未訪問駅はありません。範囲を広げるか、全駅制覇ならおめでとうございます！'
          : 'この範囲に駅がありません。範囲を広げてみてください。',
      )
      return
    }

    // 条件を満たしたのでここで1回消費する
    setRemainingDraws(consumeDraw())

    // 前回の結果にズームしたまま、または範囲へのズームが入るときは、
    // 地図の移動が終わってからフォーカスを飛ばし始める
    const needsMapFlight = picked !== null || nextSpinArea !== null

    setSpinArea(nextSpinArea)
    setPicked(null)
    setFocusStation(null)
    setDisplayName(null)
    setCheckinResult(null)
    setEarnedTitles([])
    setIsSpinning(true)

    const finalStation = candidates[Math.floor(Math.random() * candidates.length)]
    let step = 0
    let lastIdx = -1

    const tick = () => {
      if (step < SPIN_SCHEDULE.length) {
        // 直前と同じ駅は避けて視覚的な変化をはっきりさせる（フォーカスは候補の中を飛ぶ）
        let idx = Math.floor(Math.random() * candidates.length)
        if (idx === lastIdx) idx = (idx + 1) % candidates.length
        lastIdx = idx
        setTick((t) => t + 1)
        setFocusStation(candidates[idx])
        setDisplayName(candidates[idx].name)
        timerRef.current = setTimeout(tick, SPIN_SCHEDULE[step++])
      } else {
        setTick((t) => t + 1)
        setFocusStation(finalStation)
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

    if (needsMapFlight) {
      // ズームの移動（0.6〜0.8秒）が終わってからフォーカスを飛ばし始める
      timerRef.current = setTimeout(tick, 1000)
    } else {
      tick()
    }
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
        // 到達のごほうびとして抽選回数を全回復
        setRemainingDraws(refillDraws())
        setVisitedIds((prev) => new Set(prev).add(picked.id))

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
      <div className="flex w-full max-w-xl flex-col items-center gap-10 px-6 py-16 md:max-w-3xl lg:max-w-4xl">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          TokyoStationGo
        </h1>

        {/* 抽選の条件設定 */}
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            どの範囲の駅ガチャを回す？
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDifficulty(d.key)}
                aria-pressed={difficulty === d.key}
                className={`flex flex-col items-center gap-0.5 rounded-2xl border px-4 py-2 transition-colors ${
                  difficulty === d.key
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                    : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span aria-hidden="true">{d.icon}</span>
                  {d.label}
                </span>
                <span className="text-[10px] font-normal opacity-70">
                  {d.key === 'expedition'
                    ? '位置情報も不要'
                    : `現在地から${d.detail}`}
                </span>
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={unvisitedOnly}
              onChange={(e) => setUnvisitedOnly(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            未訪問の駅だけが出るようにする
          </label>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={drawStation}
            disabled={isSpinning || isLocating || remainingDraws === 0}
            className="rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-all hover:bg-zinc-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isLocating
              ? '現在地を取得中...'
              : isSpinning
                ? 'ガチャ回転中...'
                : picked
                  ? 'もう一度回す'
                  : 'ガチャを回す'}
          </button>
          {remainingDraws !== null && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              今日の残りガチャ:{' '}
              <span
                className={`font-bold ${
                  remainingDraws === 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-zinc-900 dark:text-zinc-50'
                }`}
              >
                {remainingDraws}
              </span>{' '}
              回（チェックイン成功で回復）
            </p>
          )}
          {drawError && (
            <p
              role="alert"
              className="max-w-md text-center text-xs font-medium text-amber-700 dark:text-amber-300"
            >
              {drawError}
            </p>
          )}
          {process.env.NODE_ENV === 'development' && (
            <button
              type="button"
              onClick={() => {
                setRemainingDraws(refillDraws())
                setDrawError(null)
              }}
              className="text-[10px] text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              [dev] ガチャ回数をリセット
            </button>
          )}
        </div>

        <div className="flex w-full flex-col items-center gap-6">
          <section
            className={`w-full overflow-hidden rounded-2xl border p-4 text-center transition-colors ${
              checkinResult && checkinResult.kind !== 'success'
                ? 'border-red-200 bg-red-50 dark:border-red-500/40 dark:bg-red-950/40'
                : picked
                  ? 'border-green-300 bg-green-50 dark:border-green-500/60 dark:bg-green-950/40'
                  : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
            }`}
            style={picked ? { animation: 'reel-glow 1.4s ease-out 1' } : undefined}
          >

            {/* ガチャ盤面: 東京の白地図の上をフォーカスが飛び回り、確定駅へズームする */}
            <div className="relative h-72 w-full overflow-hidden rounded-xl md:h-[30rem] lg:h-[34rem]">
              <GachaMap
                focus={focusStation}
                landedStation={!isSpinning && picked ? picked : null}
                visitedIds={visitedIds}
                spinArea={spinArea}
              />
              {displayName ? (
                <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center">
                  <span
                    key={tick}
                    className="rounded-full border border-zinc-200 bg-white/95 px-5 py-1.5 text-xl font-bold text-zinc-900 shadow-md dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-50"
                    style={{
                      animation: isSpinning
                        ? 'reel-tick 100ms ease-out'
                        : 'reel-land 600ms cubic-bezier(0.2, 1.6, 0.4, 1)',
                    }}
                  >
                    {displayName}
                  </span>
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center">
                  <span className="rounded-full border border-zinc-200 bg-white/95 px-5 py-1.5 text-xl font-bold tracking-widest text-zinc-300 shadow-md dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-600">
                    ？？？
                  </span>
                </div>
              )}
            </div>
            {picked && !isSpinning && (
              <div style={{ animation: 'lines-fade-in 450ms ease-out both' }}>
                <p className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  {picked.name}
                </p>
                <ul className="mt-3 flex flex-wrap justify-center gap-2">
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
