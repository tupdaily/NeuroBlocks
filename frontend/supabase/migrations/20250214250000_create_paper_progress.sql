-- Paper walkthrough progress: which step the user is on per paper level.
create table if not exists public.paper_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  level_number int not null,
  step_index int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, level_number)
);

create index if not exists paper_progress_user_id_idx on public.paper_progress (user_id);

alter table public.paper_progress enable row level security;

create policy "Users can insert own paper progress"
  on public.paper_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own paper progress"
  on public.paper_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can select own paper progress"
  on public.paper_progress for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.paper_progress is 'Saves current step index for paper walkthrough levels.';
