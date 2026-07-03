import { supabase } from './supabase'

// 現在のログインユーザーの id を取得する。未ログインなら null。
// supabase.auth.getUser() は JWT を検証してから user を返す。
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      // セッションが無い場合は AuthSessionMissingError が返るので、未ログイン扱いにする
      const message = error.message?.toLowerCase() ?? ''
      if (message.includes('auth session missing')) return null
      console.error('[auth] ユーザー取得失敗:', error)
      return null
    }
    return data.user?.id ?? null
  } catch (err) {
    console.error('[auth] ユーザー取得で例外:', err)
    return null
  }
}
