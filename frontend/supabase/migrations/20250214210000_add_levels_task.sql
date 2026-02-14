-- Add task column to levels: short instruction shown in the playground for each challenge
alter table public.levels
  add column if not exists task text;

comment on column public.levels.task is 'Instruction text displayed in the playground for this challenge (e.g. "Create a feed forward network using the flatten and linear layer").';
