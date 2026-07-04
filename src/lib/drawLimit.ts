// 抽選（リロール）の1日の回数制限。localStorage で端末ごとに管理する。
// 「引いたからには行く」緊張感のための制限なので、チェックイン成功で全回復する
const STORAGE_KEY = 'tsg-draw-limit'

export const DAILY_DRAWS = 3

type StoredState = {
  date: string
  remaining: number
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function load(): StoredState {
  const fresh = { date: todayKey(), remaining: DAILY_DRAWS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fresh
    const state = JSON.parse(raw) as StoredState
    // 日付が変わっていたら回数をリセット
    if (state.date !== todayKey()) return fresh
    return state
  } catch {
    return fresh
  }
}

function save(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage が使えない環境では制限なしで動かす
  }
}

export function getRemainingDraws(): number {
  return load().remaining
}

// 1回消費して残り回数を返す。残りが無ければ消費せず 0 を返す
export function consumeDraw(): number {
  const state = load()
  if (state.remaining <= 0) return 0
  const next = { date: todayKey(), remaining: state.remaining - 1 }
  save(next)
  return next.remaining
}

// チェックイン成功時に全回復させる
export function refillDraws(): number {
  save({ date: todayKey(), remaining: DAILY_DRAWS })
  return DAILY_DRAWS
}
