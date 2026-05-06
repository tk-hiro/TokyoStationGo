'use client'

type Props = {
  onOpenMenu: () => void
}

export default function Header({ onOpenMenu }: Props) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90 md:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="メニューを開く"
        className="rounded-md p-2 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          ☰
        </span>
      </button>
      <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        TokyoStationGo
      </span>
      <span aria-hidden="true" className="w-9" />
    </header>
  )
}
