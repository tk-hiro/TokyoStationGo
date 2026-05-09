'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Header from './Header'
import Sidebar from './Sidebar'

type Props = {
  children: React.ReactNode
}

// /login と /auth/* はサイドバー/ヘッダー非表示で全画面表示する
function isAuthLayoutPath(pathname: string): boolean {
  if (pathname === '/login' || pathname.startsWith('/login/')) return true
  if (pathname.startsWith('/auth/')) return true
  return false
}

export default function Layout({ children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // ページ遷移時はサイドメニューを閉じる
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('[auth] セッション取得失敗:', error)
        setSession(data.session)
        setAuthChecked(true)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[auth] セッション取得で例外:', err)
        setAuthChecked(true)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
      },
    )

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  const authLayout = isAuthLayoutPath(pathname)

  // 未ログインで保護対象ページにアクセスした場合は /login へ強制遷移
  useEffect(() => {
    if (!authChecked) return
    if (authLayout) return
    if (session) return
    const nextParam = encodeURIComponent(pathname)
    router.replace(`/login?next=${nextParam}`)
  }, [authChecked, session, authLayout, pathname, router])

  // /login や /auth/* は独自レイアウト。サイドバー/ヘッダーは出さない
  if (authLayout) {
    return <>{children}</>
  }

  // 認証チェック中、またはリダイレクト準備中は全画面ローディング
  if (!authChecked || !session) {
    return (
      <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200"
          />
          読み込み中...
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50 dark:bg-black md:pl-64">
      <Header onOpenMenu={() => setMenuOpen(true)} />
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        session={session}
      />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
