create or replace function public.block_new_auth_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'signups temporarily disabled'
    using errcode = 'P0001';
end;
$$;

revoke all on function public.block_new_auth_users() from public, anon, authenticated;
grant execute on function public.block_new_auth_users() to supabase_auth_admin;

drop trigger if exists block_new_auth_users on auth.users;
create trigger block_new_auth_users
  before insert on auth.users
  for each row execute function public.block_new_auth_users();

revoke execute on function public.admin_close_reset(uuid, text) from public, anon;
revoke execute on function public.admin_list_resets(text) from public, anon;
revoke execute on function public.admin_member_providers() from public, anon;
revoke execute on function public.admin_set_temp_password(text, text) from public, anon;
revoke execute on function public.clear_must_change() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.merge_account(uuid, uuid) from public, anon;
revoke execute on function public.my_admin_role() from public, anon;
revoke execute on function public.my_consent() from public, anon;
revoke execute on function public.my_identities() from public, anon;
revoke execute on function public.save_consent(boolean, boolean, boolean, boolean, boolean, boolean, text, text, text, boolean) from public, anon;
revoke execute on function public.set_animal_share(uuid, boolean, text, boolean, boolean, boolean) from public, anon;

revoke execute on function public.admins_guard() from public, anon, authenticated;
revoke execute on function public.care_set_owner() from public, anon, authenticated;
revoke execute on function public.care_touch() from public, anon, authenticated;
revoke execute on function public.feed_apply_usage() from public, anon, authenticated;
revoke execute on function public.profiles_guard() from public, anon, authenticated;
revoke execute on function public.purge_expired() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.roll_up_visits() from public, anon, authenticated;

alter function public.care_touch() set search_path = public;
alter view public.marketing_optin set (security_invoker = true);

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
