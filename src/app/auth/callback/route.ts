import { NextResponse, type NextRequest } from 'next/server'

// Google OAuth コールバック。Supabase クライアントは PKCE フローで動作しているため、
// ?code=... をクエリ文字列に保ったまま戻り先へリダイレクトすれば、
// クライアント側の supabase-js が detectSessionInUrl で自動的にセッション交換を行う。
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const next = requestUrl.searchParams.get('next') ?? '/'

  // ログイン後の戻り先。ホスト外への外部リダイレクト防止のため相対パスのみ許可。
  const safeNext = next.startsWith('/') ? next : '/'
  const target = new URL(safeNext, requestUrl.origin)

  if (error) {
    target.searchParams.set('auth_error', error)
    if (errorDescription) {
      target.searchParams.set('auth_error_description', errorDescription)
    }
  } else if (code) {
    target.searchParams.set('code', code)
  }

  return NextResponse.redirect(target)
}
