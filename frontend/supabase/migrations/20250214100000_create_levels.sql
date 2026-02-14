-- Levels table: pre-stored challenge graphs (read-only for app users)
-- Run in Supabase: SQL Editor → New query → paste and run.

create table if not exists public.levels (
  id uuid primary key default gen_random_uuid(),
  level_number int not null unique,
  name text not null,
  description text,
  graph_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists levels_level_number_idx on public.levels (level_number);

alter table public.levels enable row level security;

-- Anyone authenticated can read levels (challenges are public to signed-in users)
create policy "Authenticated users can read levels"
  on public.levels for select
  to authenticated
  using (true);

-- Ensure updated_at trigger helper exists (may already exist from playgrounds migration)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists levels_updated_at on public.levels;
create trigger levels_updated_at
  before update on public.levels
  for each row execute function public.set_updated_at();
