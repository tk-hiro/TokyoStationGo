'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from './Header'
import Sidebar from './Sidebar'

type Props = {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  // ページ遷移時はサイドメニューを閉じる
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50 dark:bg-black md:pl-64">
      <Header onOpenMenu={() => setMenuOpen(true)} />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
