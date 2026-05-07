import { supabase } from './supabase'
import type { Station } from '@/types/station'

const TABLE = 'visits'

export type VisitRow = {
  station_id: number
  station_name: string
  line_name: string
  checked_in_at: string
  last_visited_at: string
  visit_count: number
}

// visits テーブルから訪問済み駅の一覧を取得する。最終訪問日時の降順。
export async function fetchVisits(): Promise<VisitRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'station_id, station_name, line_name, checked_in_at, last_visited_at, visit_count',
    )
    .is('user_id', null)
    .order('last_visited_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as VisitRow[]
}

// Supabase の visits テーブルへチェックイン記録を保存する。
// 同じ station_id のレコードがあれば訪問回数+1で更新、なければ新規 insert。
// チェックイン体験を壊さないため、エラーは catch して console に出すだけにする。
export async function recordVisit(station: Station): Promise<void> {
  const now = new Date().toISOString()
  const lineName = station.line_names.join('、')

  try {
    const { data: existing, error: selectError } = await supabase
      .from(TABLE)
      .select('id, visit_count')
      .eq('station_id', station.id)
      .is('user_id', null)
      .maybeSingle()

    if (selectError) {
      console.error('[visits] 既存レコード検索に失敗:', selectError)
      return
    }

    if (existing) {
      const nextCount = (existing.visit_count ?? 0) + 1
      const { error: updateError } = await supabase
        .from(TABLE)
        .update({
          last_visited_at: now,
          visit_count: nextCount,
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error('[visits] 再訪問の更新に失敗:', updateError)
        return
      }
      console.log(
        `[visits] 再訪問を記録: ${station.name} (${nextCount}回目)`,
      )
      return
    }

    const { error: insertError } = await supabase.from(TABLE).insert({
      station_id: station.id,
      station_name: station.name,
      line_name: lineName,
      checked_in_at: now,
      last_visited_at: now,
      visit_count: 1,
      user_id: null,
    })

    if (insertError) {
      console.error('[visits] 初回チェックインの保存に失敗:', insertError)
      return
    }
    console.log(`[visits] 初回チェックインを保存: ${station.name}`)
  } catch (err) {
    console.error('[visits] 想定外のエラー:', err)
  }
}
