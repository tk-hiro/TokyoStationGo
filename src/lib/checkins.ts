import type { CheckinRecord } from '@/types/checkin'
import type { Station } from '@/types/station'

const STORAGE_KEY = 'tokyo-station-go:checkins'

export function loadCheckins(): CheckinRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is CheckinRecord =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as CheckinRecord).stationId === 'number' &&
        typeof (r as CheckinRecord).stationName === 'string' &&
        Array.isArray((r as CheckinRecord).lineNames) &&
        typeof (r as CheckinRecord).timestamp === 'string' &&
        typeof (r as CheckinRecord).distance === 'number',
    )
  } catch {
    return []
  }
}

export function addCheckin(station: Station, distance: number): void {
  if (typeof window === 'undefined') return
  const existing = loadCheckins()
  const record: CheckinRecord = {
    stationId: station.id,
    stationName: station.name,
    lineNames: station.line_names,
    timestamp: new Date().toISOString(),
    distance,
  }
  existing.push(record)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
}

export type StationVisitSummary = {
  stationId: number
  stationName: string
  lineNames: string[]
  visitCount: number
  // 最新訪問の ISO 文字列
  lastVisitedAt: string
}

// 駅IDで集約し、最新訪問順に並べる
export function summarizeByStation(
  records: CheckinRecord[],
): StationVisitSummary[] {
  const map = new Map<number, StationVisitSummary>()
  for (const r of records) {
    const current = map.get(r.stationId)
    if (current) {
      current.visitCount += 1
      if (r.timestamp > current.lastVisitedAt) {
        current.lastVisitedAt = r.timestamp
        current.stationName = r.stationName
        current.lineNames = r.lineNames
      }
    } else {
      map.set(r.stationId, {
        stationId: r.stationId,
        stationName: r.stationName,
        lineNames: r.lineNames,
        visitCount: 1,
        lastVisitedAt: r.timestamp,
      })
    }
  }
  return [...map.values()].sort((a, b) =>
    b.lastVisitedAt.localeCompare(a.lastVisitedAt),
  )
}
