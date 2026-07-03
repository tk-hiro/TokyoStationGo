'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type MenuItem = {
  href: string
  label: string
  icon: string
}

export const MENU_ITEMS: MenuItem[] = [
  { href: '/', label: '駅を抽選する', icon: '🎲' },
  { href: '/stations', label: '駅一覧', icon: '🚉' },
  { href: '/map', label: 'マップ', icon: '🗺️' },
  { href: '/titles', label: '達成目録', icon: '🏆' },
  { href: '/mypage', label: 'マイページ', icon: '📊' },
]

type Props = {
  open: boolean
  onClose: () => void
  session: Session
}

export default function Sidebar({ open, onClose, session }: Props) {
  const pathname = usePathname()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    if (signingOut) return
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) console.error('[auth] ログアウト失敗:', error)
    setSigningOut(false)
    onClose()
  }

  const userLabel =
    session.user.email ?? session.user.user_metadata?.full_name ?? null

  return (
    <>
      {/* モバイル用バックドロップ */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-900 md:translate-x-0 md:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center border-b border-zinc-200 px-5 dark:border-zinc-800">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            TokyoStationGo
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-1">
            {MENU_ITEMS.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span aria-hidden="true" className="text-base leading-none">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex flex-col gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
          {userLabel && (
            <p
              className="truncate px-2 text-xs text-zinc-500 dark:text-zinc-400"
              title={userLabel}
            >
              {userLabel}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="flex w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {signingOut ? 'ログアウト中...' : 'ログアウト'}
          </button>
        </div>
      </aside>
    </>
  )
}
