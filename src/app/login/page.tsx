'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoginButton from '@/components/LoginButton'

function resolveNext(raw: string | null): string {
  if (!raw) return '/'
  if (!raw.startsWith('/')) return '/'
  if (raw === '/login' || raw.startsWith('/login/')) return '/'
  if (raw.startsWith('/auth/')) return '/'
  return raw
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = resolveNext(searchParams.get('next'))

  // 既にログイン済みなら next へ自動遷移する
  useEffect(() => {
    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('[login] セッション取得失敗:', error)
        if (data.session) router.replace(next)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[login] セッション取得で例外:', err)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) router.replace(next)
      },
    )

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [router, next])

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-2xl ring-1 ring-white/10">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            TokyoStationGo
          </h1>
          <p className="text-base font-semibold text-emerald-600">
            東京の駅をすべて制覇せよ
          </p>
          <p className="text-sm leading-relaxed text-zinc-600">
            ランダムに選ばれた駅へ実際に足を運んでチェックイン。
            訪問した駅数を増やして東京制覇を目指すゲーミフィケーション Web アプリです。
          </p>
        </div>
        <LoginButton next={next} />
        <p className="text-xs text-zinc-500">
          続行するには Google アカウントでログインしてください
        </p>
      </div>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800">
      <div className="flex items-center gap-3 text-sm text-zinc-300">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-100"
        />
        読み込み中...
      </div>
    </div>
  )
}

// useSearchParams は Suspense 配下で使う必要があるためラップする
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  )
}
