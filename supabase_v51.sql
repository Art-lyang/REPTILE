begin;

create table if not exists private.auth_user_creation_permits (
  email text primary key,
  purpose text not null default 'closed_beta_test',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint auth_user_creation_permits_email_normalized
    check (email = lower(btrim(email))),
  constraint auth_user_creation_permits_future_expiry
    check (expires_at > created_at)
);

revoke all on table private.auth_user_creation_permits from public, anon, authenticated;
grant select, insert, update, delete on table private.auth_user_creation_permits to service_role;

create or replace function public.block_new_auth_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permitted_email text;
begin
  delete from private.auth_user_creation_permits
   where lower(email) = lower(new.email)
     and expires_at > now()
  returning email into permitted_email;

  if permitted_email is not null then
    return new;
  end if;

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

notify pgrst, 'reload schema';
commit;
