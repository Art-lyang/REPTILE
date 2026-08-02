do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception 'public.animals table is required';
  end if;
end $guard$;

alter table public.animals
  add column if not exists photos text[];

do $existing$
begin
  if exists (
    select 1 from public.animals
     where cardinality(coalesce(photos, '{}')) > 3
  ) then
    raise exception 'animals.photos contains more than three entries; review those rows first';
  end if;
end $existing$;

update public.animals
   set photos = '{}'
 where photos is null;

alter table public.animals
  alter column photos set default '{}',
  alter column photos set not null;

alter table public.animals
  drop constraint if exists animals_photos_shape_ck;

alter table public.animals
  add constraint animals_photos_shape_ck
  check (
    cardinality(photos) <= 3
    and array_position(photos, null) is null
  );

create or replace function public.care_animal_photos_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  photo_ref text;
  object_path text;
  total_count int;
  unique_count int;
begin
  new.photo_url := nullif(btrim(coalesce(new.photo_url, '')), '');
  new.photos := coalesce(new.photos, '{}');

  if cardinality(new.photos) > 3 then
    raise exception 'additional photos are limited to three';
  end if;

  select count(*), count(distinct value)
    into total_count, unique_count
    from unnest(new.photos) as value;

  if total_count <> unique_count
     or exists (select 1 from unnest(new.photos) value where btrim(value) = '') then
    raise exception 'photo references must be non-empty and unique';
  end if;

  if new.photo_url is not null and new.photo_url = any(new.photos) then
    raise exception 'profile photo cannot be duplicated in additional photos';
  end if;

  foreach photo_ref in array array_cat(
    case when new.photo_url is null then '{}'::text[] else array[new.photo_url] end,
    new.photos
  )
  loop
    if position('/animal-photos/' in photo_ref) > 0 then
      object_path := split_part(split_part(photo_ref, '/animal-photos/', 2), '?', 1);
      if new.user_id is null
         or not starts_with(object_path, 'a/u_' || new.user_id::text || '_') then
        raise exception 'animal photo does not belong to this account';
      end if;
    elsif photo_ref !~ '^https?://' and not starts_with(photo_ref, '/') then
      raise exception 'unsupported animal photo reference';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.care_animal_photos_guard() from public, anon, authenticated;

drop trigger if exists care_animal_photos_guard on public.animals;
create trigger care_animal_photos_guard
  before insert or update
  on public.animals
  for each row execute function public.care_animal_photos_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'animal-photos',
  'animal-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ap_read on storage.objects;
create policy ap_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'animal-photos'
    and (
      owner_id = (select auth.uid()::text)
      or exists (
        select 1
          from public.animals a
         where a.is_public = true
           and a.user_id::text = storage.objects.owner_id
           and (
             split_part(split_part(a.photo_url, '/animal-photos/', 2), '?', 1)
               = storage.objects.name
             or exists (
               select 1
                 from unnest(coalesce(a.photos, '{}')) as photo_ref
                where split_part(split_part(photo_ref, '/animal-photos/', 2), '?', 1)
                      = storage.objects.name
             )
           )
      )
    )
  );

drop policy if exists ap_insert on storage.objects;
create policy ap_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'animal-photos'
    and starts_with(name, 'a/u_' || (select auth.uid())::text || '_')
  );

drop policy if exists ap_update on storage.objects;
create policy ap_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'animal-photos'
    and owner_id = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'animal-photos'
    and owner_id = (select auth.uid()::text)
    and starts_with(name, 'a/u_' || (select auth.uid())::text || '_')
  );

drop policy if exists ap_delete on storage.objects;
create policy ap_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'animal-photos'
    and owner_id = (select auth.uid()::text)
  );

select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
 where id = 'animal-photos';

select constraint_name
  from information_schema.table_constraints
 where table_schema = 'public'
   and table_name = 'animals'
   and constraint_name = 'animals_photos_shape_ck';

select policyname, roles, cmd
  from pg_policies
 where schemaname = 'storage'
   and tablename = 'objects'
   and policyname in ('ap_read', 'ap_insert', 'ap_update', 'ap_delete')
 order by policyname;
