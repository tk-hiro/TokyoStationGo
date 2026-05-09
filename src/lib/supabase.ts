import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('環境変数 NEXT_PUBLIC_SUPABASE_URL が設定されていません')
}
if (!supabaseAnonKey) {
  throw new Error('環境変数 NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません')
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // OAuth コールバックでコードをクエリ文字列として受け取るため PKCE を使用
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
