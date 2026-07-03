-- targets テーブル: 「次に行く駅」（抽選で選ばれた目標駅）をユーザーごとに1件記録する
-- 抽選確定時に upsert し、その駅へのチェックイン成功時に削除する（src/lib/targets.ts が参照）
create table if not exists public.targets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  station_id bigint not null,
  station_name text not null,
  line_name text,
  drawn_at timestamptz not null default now()
);

alter table public.targets enable row level security;

-- 自分の行だけ読み書きできる
create policy "targets_select_own" on public.targets
  for select using (auth.uid() = user_id);
create policy "targets_insert_own" on public.targets
  for insert with check (auth.uid() = user_id);
create policy "targets_update_own" on public.targets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "targets_delete_own" on public.targets
  for delete using (auth.uid() = user_id);
