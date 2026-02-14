-- Chat history: one row per message, keyed by user + playground
create table if not exists public.user_histories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  playground_id uuid not null references public.playgrounds(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_histories_user_playground_idx
  on public.user_histories (user_id, playground_id, created_at);

alter table public.user_histories enable row level security;

create policy "Users can read own history"
  on public.user_histories for select
  using (auth.uid() = user_id);

create policy "Users can insert own history"
  on public.user_histories for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own history"
  on public.user_histories for delete
  using (auth.uid() = user_id);
