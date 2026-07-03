// レベルは訪問駅数だけで決まる（CLAUDE.md の仕様）。
// レベル L に必要な累計駅数は三角数 L(L-1)/2。序盤は1〜2駅ごとに上がり、
// 後半はじっくり。615駅で最大 Lv35 になる
export const MAX_LEVEL = 35

// 5レベルごとのランク名。鉄道員の階級を出世していくイメージ
const RANK_NAMES: Array<{ minLevel: number; name: string }> = [
  { minLevel: 35, name: '統括駅長' },
  { minLevel: 30, name: '駅長' },
  { minLevel: 25, name: '助役' },
  { minLevel: 20, name: '主任' },
  { minLevel: 15, name: '運転士' },
  { minLevel: 10, name: '車掌' },
  { minLevel: 5, name: '駅員' },
  { minLevel: 1, name: '見習い駅員' },
]

export type LevelInfo = {
  level: number
  rankName: string
  // 次のレベルまでに必要な残り駅数（最大レベルなら null）
  stationsToNext: number | null
  // 現レベル帯での進捗 0〜1（プログレスバー用。最大レベルなら 1）
  progress: number
}

// レベル L に到達するのに必要な累計訪問駅数
function requiredFor(level: number): number {
  return (level * (level - 1)) / 2
}

export function getLevelInfo(visitedCount: number): LevelInfo {
  let level = 1
  while (level < MAX_LEVEL && visitedCount >= requiredFor(level + 1)) {
    level += 1
  }

  const rankName =
    RANK_NAMES.find((r) => level >= r.minLevel)?.name ?? RANK_NAMES.at(-1)!.name

  if (level >= MAX_LEVEL) {
    return { level, rankName, stationsToNext: null, progress: 1 }
  }

  const current = requiredFor(level)
  const next = requiredFor(level + 1)
  return {
    level,
    rankName,
    stationsToNext: next - visitedCount,
    progress: (visitedCount - current) / (next - current),
  }
}
