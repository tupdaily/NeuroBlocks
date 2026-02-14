-- Add section to levels: 'challenges' (default) or 'papers'
alter table public.levels
  add column if not exists section text not null default 'challenges';

comment on column public.levels.section is 'Display section: challenges (guided exercises) or papers (paper-based design tasks).';
