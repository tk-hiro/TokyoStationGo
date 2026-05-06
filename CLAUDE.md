@AGENTS.md

# TokyoStationGo

## アプリ概要
東京都の駅を制覇するゲーミフィケーションWebアプリ。
ランダムに駅が選ばれ、実際にその駅に行くと位置情報で検証してチェックイン。
訪問駅数に応じてレベルアップしていく。

## 技術スタック
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (DB・認証)
- Vercel (デプロイ)

## ディレクトリ構成
- src/app/ → ページ
- src/components/ → UIコンポーネント
- src/lib/ → ロジック・ユーティリティ
- src/types/ → 型定義
- src/data/ → 静的データ（駅データなど）

## コーディング規約
- TypeScriptの型は必ず定義する
- コンポーネントはなるべく小さく分割する
- 日本語コメントOK

## 重要な仕様
- 駅の到着判定は半径300m以内
- Geolocation APIはhttpsでのみ動作する
- レベルは訪問駅数で決まる