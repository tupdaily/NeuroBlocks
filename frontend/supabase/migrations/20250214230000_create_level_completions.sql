-- Track which challenges each user has completed (for badges and progress).
create table if not exists public.level_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  level_number int not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, level_number)
);

create index if not exists level_completions_user_id_idx on public.level_completions (user_id);
create index if not exists level_completions_level_number_idx on public.level_completions (level_number);

alter table public.level_completions enable row level security;

-- Users can insert their own completion (when they pass a challenge).
create policy "Users can insert own level completions"
  on public.level_completions for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can read their own completions.
create policy "Users can select own level completions"
  on public.level_completions for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.level_completions is 'Records when a user completes a challenge level (submit correct).';
