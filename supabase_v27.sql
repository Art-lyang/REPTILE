/* =============================================================================
   supabase_v27.sql — 공개 morph-images 버킷 업로드 잠금
   -----------------------------------------------------------------------------
   목적
     · 기존 공개 이미지 URL은 그대로 유지합니다.
     · 로그인하지 않은 사용자의 업로드와 파일 목록 조회를 막습니다.
     · 관리자만 m/ 폴더에 모프 이미지를 올릴 수 있습니다.
     · 업로드는 이미지 형식, 파일당 5MB로 제한합니다.

   주의
     · morph-images/a/ 에 남은 옛 개체 사진은 삭제하거나 옮기지 않습니다.
     · 옛 사진을 animal-photos 로 옮긴 뒤 별도로 정리합니다.
   ============================================================================= */

do $guard$
begin
  if not exists (select 1 from storage.buckets where id = 'morph-images') then
    raise exception 'morph-images 버킷이 없습니다';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() 함수가 없습니다';
  end if;
end $guard$;

/* 공개 URL은 유지하되 업로드 제한을 버킷 자체에도 적용합니다. */
update storage.buckets
   set public = true,
       file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'morph-images';

/* 공개 버킷은 public URL 읽기에 SELECT 정책이 필요하지 않습니다.
   SELECT는 관리자 SDK 작업과 upsert에만 허용합니다. */
drop policy if exists mi_read on storage.objects;
create policy mi_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'morph-images'
    and public.is_admin()
  );

/* 관리자만 모프 이미지 전용 m/ 폴더에 올릴 수 있습니다. */
drop policy if exists mi_insert on storage.objects;
create policy mi_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'morph-images'
    and public.is_admin()
    and (storage.foldername(name))[1] = 'm'
  );

/* 기존 정책도 관리자 전용임을 다시 고정합니다. */
drop policy if exists mi_update on storage.objects;
create policy mi_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'morph-images'
    and public.is_admin()
  )
  with check (
    bucket_id = 'morph-images'
    and public.is_admin()
    and (storage.foldername(name))[1] = 'm'
  );

drop policy if exists mi_delete on storage.objects;
create policy mi_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'morph-images'
    and public.is_admin()
  );

/* 적용 후 확인용 — 옛 사진 수는 0이 아니어도 됩니다. */
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
 where id = 'morph-images';

select policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'storage'
   and tablename = 'objects'
   and policyname in ('mi_read', 'mi_insert', 'mi_update', 'mi_delete')
 order by policyname;

select count(*) as legacy_animal_photos
  from storage.objects
 where bucket_id = 'morph-images'
   and name like 'a/%';
