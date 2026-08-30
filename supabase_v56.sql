-- =============================================================================
-- v56 — 관리자 화면에서 저장 용량을 볼 수 있게
-- -----------------------------------------------------------------------------
-- 왜
--   Supabase 무료 요금제는 스토리지 1GB, 데이터베이스 500MB 입니다. 지금은
--   대시보드에 직접 들어가야만 얼마나 찼는지 알 수 있어서, "언제 유료로
--   올려야 하나" 를 판단할 근거가 화면에 없습니다.
--
--   Cloudflare 쪽은 걱정하지 않아도 됩니다. 정적 자산 요청은 Workers 일일
--   한도에 포함되지 않고 CDN 전송량도 제한이 없습니다. 먼저 차는 것은
--   사진(스토리지)이고, 사진은 서명 URL 로 Supabase 에서 바로 받아가기 때문에
--   Cloudflare 캐시의 혜택도 받지 못합니다.
--
-- 적용
--   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- =============================================================================

begin;

-- 무료 요금제 한도. 요금제를 올리면 이 값만 고치면 화면이 따라갑니다.
create or replace function public.care_storage_quota_bytes()
returns bigint language sql immutable set search_path = '' as $$ select 1073741824::bigint $$;  -- 1GB
create or replace function public.care_db_quota_bytes()
returns bigint language sql immutable set search_path = '' as $$ select 524288000::bigint $$;   -- 500MB

-- 사용량 조회.
--   storage.objects 의 metadata->>'size' 가 파일 크기입니다. 업로드 방식에 따라
--   비어 있는 행이 있을 수 있어 coalesce 로 0 처리합니다 — 없는 값을 null 로
--   두면 합계 전체가 null 이 됩니다.
create or replace function public.admin_storage_usage()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then jsonb_build_object(
    'storage', jsonb_build_object(
      'bytes', coalesce((select sum(coalesce((o.metadata->>'size')::bigint, 0))
                           from storage.objects o where o.bucket_id = 'animal-photos'), 0),
      'files', coalesce((select count(*) from storage.objects o
                          where o.bucket_id = 'animal-photos'), 0),
      'quota', public.care_storage_quota_bytes()
    ),
    'database', jsonb_build_object(
      'bytes', pg_database_size(current_database()),
      'quota', public.care_db_quota_bytes()
    ),
    /* 가장 많이 쓰는 회원. 한 사람 때문에 용량이 튀는지 바로 보입니다.
       경로가 <user_id>/... 형태라 첫 조각이 소유자입니다. */
    'top', coalesce((
      select jsonb_agg(t) from (
        select split_part(o.name, '/', 1) as owner,
               count(*)                    as files,
               sum(coalesce((o.metadata->>'size')::bigint, 0)) as bytes
          from storage.objects o
         where o.bucket_id = 'animal-photos'
         group by 1
         order by 3 desc
         limit 5
      ) t), '[]'::jsonb)
  ) else null end;
$$;

revoke all on function public.admin_storage_usage() from public, anon;
grant execute on function public.admin_storage_usage() to authenticated;

notify pgrst, 'reload schema';
commit;
