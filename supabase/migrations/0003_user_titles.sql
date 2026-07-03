-- user_titles テーブル: 獲得した称号の記録（称号の定義は src/data/titles.ts の静的データ）
-- 判定はクライアントで行い、獲得した瞬間の日時だけをここに永続化する
create table if not exists public.user_titles (
  user_id uuid not null references auth.users (id) on delete cascade,
  title_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

alter table public.user_titles enable row level security;

-- 自分の行だけ読み書きできる（獲得の取り消しは想定しないため update は無し）
create policy "user_titles_select_own" on public.user_titles
  for select using (auth.uid() = user_id);
create policy "user_titles_insert_own" on public.user_titles
  for insert with check (auth.uid() = user_id);
create policy "user_titles_delete_own" on public.user_titles
  for delete using (auth.uid() = user_id);
