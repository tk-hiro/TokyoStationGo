import { supabase } from './supabase'
import { getCurrentUserId } from './currentUser'
import type { Station } from '@/types/station'

const TABLE = 'targets'

// 「次に行く駅」（抽選で選ばれた目標駅）。ユーザーごとに最大1件。
export type TargetRow = {
  station_id: number
  station_name: string
  line_name: string | null
  drawn_at: string
}

// 現在の目標駅を取得する。未ログイン・未設定なら null。
export async function fetchTarget(): Promise<TargetRow | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from(TABLE)
    .select('station_id, station_name, line_name, drawn_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[targets] 目標駅の取得に失敗:', error)
    return null
  }
  return data as TargetRow | null
}

// 抽選で選ばれた駅を目標駅として保存する（既存の目標は上書き）。
// 抽選体験を壊さないため、エラーは catch して console に出すだけにする。
export async function saveTarget(station: Station): Promise<void> {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      console.warn('[targets] 未ログインのため目標駅の保存をスキップ')
      return
    }

    const { error } = await supabase.from(TABLE).upsert(
      {
        user_id: userId,
        station_id: station.id,
        station_name: station.name,
        line_name: station.line_names.join('、'),
        drawn_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (error) {
      console.error('[targets] 目標駅の保存に失敗:', error)
      return
    }
    console.log(`[targets] 目標駅を保存: ${station.name}`)
  } catch (err) {
    console.error('[targets] 想定外のエラー:', err)
  }
}

// 目標駅を削除する（チェックイン成功時に呼ぶ）。
// stationId を渡すと、その駅が目標のときだけ削除する。
export async function clearTarget(stationId?: number): Promise<void> {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return

    let query = supabase.from(TABLE).delete().eq('user_id', userId)
    if (stationId !== undefined) {
      query = query.eq('station_id', stationId)
    }
    const { error } = await query

    if (error) {
      console.error('[targets] 目標駅の削除に失敗:', error)
      return
    }
    console.log('[targets] 目標駅をクリア')
  } catch (err) {
    console.error('[targets] 想定外のエラー:', err)
  }
}
