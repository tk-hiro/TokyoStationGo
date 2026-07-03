import { supabase } from './supabase'
import { getCurrentUserId } from './currentUser'
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

export class NotAuthenticatedError extends Error {
  constructor() {
    super('ログインが必要です')
    this.name = 'NotAuthenticatedError'
  }
}

// Supabase の visits テーブルへチェックイン記録を保存する。
// ログイン中のユーザー(user_id)に紐付け、同じ駅の既存レコードがあれば
// last_visited_at と visit_count を更新する。
// チェックイン体験を壊さないため、エラーは catch して console に出すだけにする。
export async function recordVisit(station: Station): Promise<void> {
  const now = new Date().toISOString()
  const lineName = station.line_names.join('、')

  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      console.warn('[visits] 未ログインのため visits 保存をスキップ')
      return
    }

    const { data: existing, error: selectError } = await supabase
      .from(TABLE)
      .select('id, visit_count')
      .eq('station_id', station.id)
      .eq('user_id', userId)
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
      user_id: userId,
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

// 現在のログインユーザーの訪問済み駅を取得する。最終訪問日時の降順。
// 未ログインの場合は NotAuthenticatedError を throw する。
export async function fetchVisits(): Promise<VisitRow[]> {
  const userId = await getCurrentUserId()
  if (!userId) {
    throw new NotAuthenticatedError()
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'station_id, station_name, line_name, checked_in_at, last_visited_at, visit_count',
    )
    .eq('user_id', userId)
    .order('last_visited_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as VisitRow[]
}
