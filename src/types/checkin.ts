export type CheckinRecord = {
  stationId: number
  stationName: string
  lineNames: string[]
  // ISO 8601 文字列
  timestamp: string
  // チェックイン時の駅からの距離(m)
  distance: number
}
