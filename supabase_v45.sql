revoke all on public.mating_groups from public, anon;
revoke all on public.mating_events from public, anon;
grant select, insert, update, delete on public.mating_groups to authenticated;
grant select, insert, update, delete on public.mating_events to authenticated;
revoke all on function public.save_mating_group(jsonb, uuid[]) from public, anon;
grant execute on function public.save_mating_group(jsonb, uuid[]) to authenticated;
notify pgrst, 'reload schema';
