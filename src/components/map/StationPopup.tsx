import type { MapStation } from '@/lib/mapData'

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

const STATUS_LABEL: Record<MapStation['status'], string> = {
  target: '🎯 次の目標駅',
  visited: '✅ 訪問済み',
  unvisited: '未訪問',
}

const STATUS_CLASS: Record<MapStation['status'], string> = {
  target: 'bg-amber-100 text-amber-800',
  visited: 'bg-emerald-100 text-emerald-700',
  unvisited: 'bg-zinc-100 text-zinc-500',
}

// マーカータップ時のポップアップ内容。
// Leaflet のポップアップは常に白背景なので、ダークモードでも読める固定色で書く。
export default function StationPopup({ station }: { station: MapStation }) {
  return (
    <div className="flex min-w-44 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-bold text-zinc-900">{station.name}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[station.status]}`}
        >
          {STATUS_LABEL[station.status]}
        </span>
      </div>

      <ul className="flex flex-wrap gap-1">
        {station.line_names.map((line) => (
          <li
            key={line}
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600"
          >
            {line}
          </li>
        ))}
      </ul>

      {station.visit && (
        <p className="text-xs text-zinc-500">
          {station.visit.visit_count}回訪問 ／ 初回{' '}
          {dateFormatter.format(new Date(station.visit.checked_in_at))} ／ 最終{' '}
          {dateFormatter.format(new Date(station.visit.last_visited_at))}
        </p>
      )}

      <a
        href={`https://www.google.com/maps?q=${station.lat},${station.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-blue-600 underline underline-offset-2"
      >
        Google マップで開く
      </a>
    </div>
  )
}
