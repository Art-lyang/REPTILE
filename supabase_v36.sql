create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.care_is_public_animal_photo(
  p_object_name text,
  p_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_object_name, '') <> ''
    and coalesce(p_owner_id, '') <> ''
    and exists (
      select 1
        from public.animals a
       where a.is_public = true
         and a.user_id::text = p_owner_id
         and (
           split_part(split_part(coalesce(a.photo_url, ''), '/animal-photos/', 2), '?', 1)
             = p_object_name
           or exists (
             select 1
               from unnest(coalesce(a.photos, '{}'::text[])) as photo_ref
              where split_part(split_part(photo_ref, '/animal-photos/', 2), '?', 1)
                    = p_object_name
           )
         )
    )
$$;

revoke all on function private.care_is_public_animal_photo(text,text) from public;
grant execute on function private.care_is_public_animal_photo(text,text) to anon, authenticated;

drop policy if exists ap_read on storage.objects;
create policy ap_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'animal-photos'
    and (
      owner_id = (select auth.uid()::text)
      or private.care_is_public_animal_photo(
        storage.objects.name,
        storage.objects.owner_id
      )
    )
  );

drop function if exists public.care_is_public_animal_photo(text,text);

select private.care_is_public_animal_photo(
  'not-a-real-object',
  'not-a-real-owner'
) = false as rejects_unlinked_object;
