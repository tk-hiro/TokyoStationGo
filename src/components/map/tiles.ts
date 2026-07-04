// 地名・道路ラベルの無い白地図タイル（CARTO basemap）。
// 情報量を駅マーカーだけに絞ってゲーム盤面のような見た目にする。
// マップページとガチャ演出の両方から使う
export const TILE_LIGHT =
  'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
export const TILE_DARK =
  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
export const TILE_SUBDOMAINS = 'abcd'

// OS のダークモード設定に合わせたタイル URL を返す（クライアント専用）
export function tileUrlForColorScheme(): string {
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? TILE_DARK : TILE_LIGHT
}
