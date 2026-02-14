-- Store the correct answer graph for each challenge (used for Submit check).
alter table public.levels
  add column if not exists solution_graph_json jsonb;

comment on column public.levels.solution_graph_json is 'Correct graph (GraphSchema) for this challenge; used to validate user submission.';
