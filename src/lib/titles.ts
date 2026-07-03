import stationsData from '@/data/stations.json'
import { TITLES, TITLES_BY_ID, type TitleDef } from '@/data/titles'
import type { Station } from '@/types/station'
import { supabase } from './supabase'
import { getCurrentUserId } from './currentUser'
import type { VisitRow } from './visits'

const stations = stationsData as Station[]
const TABLE = 'user_titles'

export type OwnedTitle = {
  title_id: string
  earned_at: string
}

// チェックインの瞬間にしか判定できないイベント（visits からは復元できない）
export type TitleEvents = {
  // 抽選したその日のうちに目標駅へチェックインした
  targetSameDay?: boolean
}

// ---- 駅データ由来のインデックス（モジュール読み込み時に1度だけ構築） ----

const STATION_BY_ID = new Map(stations.map((s) => [s.id, s]))

const STATION_IDS_BY_LINE = (() => {
  const map = new Map<number, Set<number>>()
  for (const s of stations) {
    for (const lineId of s.lines) {
      let ids = map.get(lineId)
      if (!ids) {
        ids = new Set()
        map.set(lineId, ids)
      }
      ids.add(s.id)
    }
  }
  return map
})()

// 東西南北の果ての駅ID
const EXTREME_STATION_IDS = (() => {
  let east = stations[0]
  let west = stations[0]
  let south = stations[0]
  let north = stations[0]
  for (const s of stations) {
    if (s.lng > east.lng) east = s
    if (s.lng < west.lng) west = s
    if (s.lat < south.lat) south = s
    if (s.lat > north.lat) north = s
  }
  return new Set([east.id, west.id, south.id, north.id])
})()

// ---- 判定エンジン ------------------------------------------------------

// ローカル日付での通算日数（週連続・1日N駅の判定用）
function localDayNumber(iso: string): number {
  const d = new Date(iso)
  return Math.floor(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(1970, 0, 1).getTime()) /
      86400000,
  )
}

// 月曜はじまりの通算週番号（1970-01-01 は木曜）
function weekNumber(dayNumber: number): number {
  return Math.floor((dayNumber + 3) / 7)
}

function maxConsecutiveWeeks(visits: VisitRow[]): number {
  const weeks = new Set<number>()
  for (const v of visits) {
    weeks.add(weekNumber(localDayNumber(v.checked_in_at)))
    weeks.add(weekNumber(localDayNumber(v.last_visited_at)))
  }
  const sorted = [...weeks].sort((a, b) => a - b)
  let best = 0
  let run = 0
  let prev: number | null = null
  for (const w of sorted) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = w
  }
  return best
}

function maxStationsInOneDay(visits: VisitRow[]): number {
  const byDay = new Map<number, number>()
  for (const v of visits) {
    const day = localDayNumber(v.checked_in_at)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  return Math.max(0, ...byDay.values())
}

// 現在の visits で条件を満たしている称号IDの一覧を返す。
// targetSameDay のようなイベント称号は events で明示されたときだけ成立する
export function evaluateTitles(
  visits: VisitRow[],
  events: TitleEvents = {},
): Set<string> {
  const visitedIds = new Set(visits.map((v) => Number(v.station_id)))
  const maxSameStation = Math.max(0, ...visits.map((v) => v.visit_count ?? 0))
  const maxPerDay = maxStationsInOneDay(visits)
  const streak = maxConsecutiveWeeks(visits)

  const hours = new Set<number>()
  for (const v of visits) {
    hours.add(new Date(v.checked_in_at).getHours())
    hours.add(new Date(v.last_visited_at).getHours())
  }

  const satisfied = new Set<string>()
  for (const title of TITLES) {
    const c = title.condition
    let ok = false
    switch (c.kind) {
      case 'total':
        ok = visitedIds.size >= c.count
        break
      case 'line': {
        const ids = STATION_IDS_BY_LINE.get(c.lineId)
        ok = !!ids && [...ids].every((id) => visitedIds.has(id))
        break
      }
      case 'lineGroup':
        ok = c.lineIds.every((lineId) => {
          const ids = STATION_IDS_BY_LINE.get(lineId)
          return !!ids && [...ids].every((id) => visitedIds.has(id))
        })
        break
      case 'sameStationVisits':
        ok = maxSameStation >= c.count
        break
      case 'stationsInOneDay':
        ok = maxPerDay >= c.count
        break
      case 'hubStation':
        ok = [...visitedIds].some(
          (id) => (STATION_BY_ID.get(id)?.lines.length ?? 0) >= c.minLines,
        )
        break
      case 'extremes':
        ok = [...EXTREME_STATION_IDS].every((id) => visitedIds.has(id))
        break
      case 'timeOfDay':
        ok = [...hours].some(
          (h) =>
            (c.beforeHour !== undefined && h < c.beforeHour) ||
            (c.afterHour !== undefined && h >= c.afterHour),
        )
        break
      case 'streakWeeks':
        ok = streak >= c.weeks
        break
      case 'targetSameDay':
        ok = events.targetSameDay === true
        break
    }
    if (ok) satisfied.add(title.id)
  }
  return satisfied
}

// ---- DB 同期 -----------------------------------------------------------

// 獲得済み称号の一覧を取得する。未ログインなら空
export async function fetchOwnedTitles(): Promise<OwnedTitle[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select('title_id, earned_at')
    .eq('user_id', userId)

  if (error) {
    console.error('[titles] 獲得称号の取得に失敗:', error)
    return []
  }
  return (data ?? []) as OwnedTitle[]
}

// 条件を満たしているのに未登録の称号を DB に登録し、新規獲得ぶんを返す。
// チェックイン直後の演出と、称号ページ表示時の遡り付与の両方から呼ぶ
export async function syncTitles(
  visits: VisitRow[],
  events: TitleEvents = {},
): Promise<TitleDef[]> {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return []

    const owned = new Set((await fetchOwnedTitles()).map((t) => t.title_id))
    const satisfied = evaluateTitles(visits, events)
    const newIds = [...satisfied].filter((id) => !owned.has(id))
    if (newIds.length === 0) return []

    const { error } = await supabase
      .from(TABLE)
      .insert(newIds.map((title_id) => ({ user_id: userId, title_id })))

    if (error) {
      console.error('[titles] 称号の登録に失敗:', error)
      return []
    }
    return newIds
      .map((id) => TITLES_BY_ID.get(id))
      .filter((t): t is TitleDef => t !== undefined)
  } catch (err) {
    console.error('[titles] 想定外のエラー:', err)
    return []
  }
}
