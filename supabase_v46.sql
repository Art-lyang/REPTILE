create index if not exists mating_groups_user_species_updated_idx
  on public.mating_groups(user_id, species, updated_at desc);
create index if not exists mating_groups_male_idx on public.mating_groups(male);
create index if not exists mating_groups_project_idx on public.mating_groups(project_id)
  where project_id is not null;
create index if not exists mating_events_user_date_idx
  on public.mating_events(user_id, occurred_on desc, created_at desc);
