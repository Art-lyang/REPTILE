/* =============================================================================
   v28 — 계정·프리미엄 API 잠금 + 통계 입력 통제
   2026-07-31

   공개 유지
     · 계산기 자체
     · 공개 갤러리 조회(public_animal, public_animals)
     · 제한된 방문/조합 통계 기록(log_visit, log_combo_query)

   로그인 필요
     · 개인 개체·페어링·클러치 조회/저장/삭제
     · 기기 기록 이관
     · 프리미엄 조회/코드 사용

   일시 중지
     · 비밀번호 재설정 접수
   ============================================================================= */

/* ── 1. 개인 기록·프리미엄 함수는 로그인한 계정만 ─────────────────────── */
revoke all on function public.my_rows(text,text) from public;
revoke execute on function public.my_rows(text,text) from anon;
grant execute on function public.my_rows(text,text) to authenticated;

revoke all on function public.save_row(text,text,jsonb) from public;
revoke execute on function public.save_row(text,text,jsonb) from anon;
grant execute on function public.save_row(text,text,jsonb) to authenticated;

revoke all on function public.delete_row(text,text,uuid) from public;
revoke execute on function public.delete_row(text,text,uuid) from anon;
grant execute on function public.delete_row(text,text,uuid) to authenticated;

revoke all on function public.claim_device(text,text) from public;
revoke execute on function public.claim_device(text,text) from anon;
grant execute on function public.claim_device(text,text) to authenticated;

revoke all on function public.redeem_code(text,text) from public;
revoke execute on function public.redeem_code(text,text) from anon;
grant execute on function public.redeem_code(text,text) to authenticated;

revoke all on function public.is_premium(text) from public;
revoke execute on function public.is_premium(text) from anon;
grant execute on function public.is_premium(text) to authenticated;

revoke all on function public.premium_status(text) from public;
revoke execute on function public.premium_status(text) from anon;
grant execute on function public.premium_status(text) to authenticated;

/* 계정 기능을 공개하기 전까지 접수 함수도 외부에서 호출하지 못하게 합니다. */
revoke all on function public.request_password_reset(text,text) from public;
revoke execute on function public.request_password_reset(text,text) from anon;
revoke execute on function public.request_password_reset(text,text) from authenticated;


/* ── 2. 공개 갤러리 조회는 그대로 유지 ─────────────────────────────────── */
revoke all on function public.public_animal(text) from public;
grant execute on function public.public_animal(text) to anon, authenticated;

revoke all on function public.public_animals(text,integer,integer) from public;
grant execute on function public.public_animals(text,integer,integer) to anon, authenticated;


/* ── 3. 통계 표 직접 쓰기 차단 ─────────────────────────────────────────── */
drop policy if exists visits_insert on public.visits;
drop policy if exists visits_insert_anyone on public.visits;
drop policy if exists cq_insert on public.combo_queries;
drop policy if exists combo_insert_anyone on public.combo_queries;

revoke all on table public.visits from anon, authenticated;
revoke all on table public.combo_queries from anon, authenticated;
grant select on table public.visits to authenticated;
grant select on table public.combo_queries to authenticated;

create index if not exists visits_device_service_ts_idx
  on public.visits (device, service, ts desc);
create index if not exists combo_queries_device_service_ts_idx
  on public.combo_queries (device, service, ts desc);


/* ── 4. 검증된 방문 기록 함수 ────────────────────────────────────────────
   브라우저가 보내는 값은 신뢰하지 않습니다. 허용 목록·길이·일일 건수와
   짧은 중복 간격을 서버에서 확인한 뒤 필요한 칼럼만 넣습니다. */
create or replace function public.log_visit(
  p_device text,
  p_lang text,
  p_service text,
  p_client text,
  p_ua text,
  p_ref_kind text,
  p_ref_host text,
  p_ref_name text,
  p_country text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_lang text;
  v_client text;
  v_ref_kind text;
  v_ref_host text;
  v_country text;
begin
  if p_device is null
     or char_length(p_device) > 96
     or p_device !~ '^dev_[A-Za-z0-9_-]{4,90}$' then
    return false;
  end if;

  if p_service not in ('gecko','crested','fattail','ballpython','care') then
    return false;
  end if;

  v_lang := case when p_lang in ('ko','en','ja','zh') then p_lang else 'ko' end;
  v_client := case when p_client in ('human','bot','ai') then p_client else 'human' end;
  v_ref_kind := case
    when p_ref_kind in ('direct','internal','sns','search','site') then p_ref_kind
    else 'direct'
  end;
  v_ref_host := case
    when p_ref_host ~ '^[A-Za-z0-9.-]{1,120}$' then lower(p_ref_host)
    else null
  end;
  v_country := case when p_country ~ '^[A-Z]{2}$' then p_country else null end;

  perform pg_advisory_xact_lock(hashtext('visit|' || p_device || '|' || p_service));

  if exists (
    select 1
      from public.visits
     where device = p_device
       and service = p_service
       and ts > now() - interval '3 seconds'
  ) then
    return false;
  end if;

  select count(*) into v_count
    from public.visits
   where device = p_device
     and service = p_service
     and ts > now() - interval '1 day';

  if v_count >= 120 then
    return false;
  end if;

  insert into public.visits
    (device, lang, service, client, ua, ref_kind, ref_host, ref_name, country)
  values
    (p_device, v_lang, p_service, v_client,
     left(coalesce(p_ua, ''), 300),
     v_ref_kind, v_ref_host, left(nullif(trim(coalesce(p_ref_name, '')), ''), 120),
     v_country);

  return true;
end;
$$;


/* ── 5. 검증된 조합 검색 기록 함수 ─────────────────────────────────────── */
create or replace function public.log_combo_query(
  p_device text,
  p_service text,
  p_ckey text,
  p_label text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_ckey text := trim(coalesce(p_ckey, ''));
begin
  if p_device is null
     or char_length(p_device) > 96
     or p_device !~ '^dev_[A-Za-z0-9_-]{4,90}$' then
    return false;
  end if;

  if p_service not in ('gecko','crested','fattail','ballpython','care') then
    return false;
  end if;

  if v_ckey = '' or char_length(v_ckey) > 1500 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('combo|' || p_device || '|' || p_service));

  if exists (
    select 1
      from public.combo_queries
     where device = p_device
       and service = p_service
       and ckey = v_ckey
       and ts > now() - interval '3 seconds'
  ) then
    return false;
  end if;

  select count(*) into v_count
    from public.combo_queries
   where device = p_device
     and service = p_service
     and ts > now() - interval '1 day';

  if v_count >= 240 then
    return false;
  end if;

  insert into public.combo_queries (device, service, ckey, label)
  values (
    p_device,
    p_service,
    v_ckey,
    left(nullif(trim(coalesce(p_label, '')), ''), 500)
  );

  return true;
end;
$$;

revoke all on function public.log_visit(text,text,text,text,text,text,text,text,text)
  from public;
grant execute on function public.log_visit(text,text,text,text,text,text,text,text,text)
  to anon, authenticated;

revoke all on function public.log_combo_query(text,text,text,text)
  from public;
grant execute on function public.log_combo_query(text,text,text,text)
  to anon, authenticated;
