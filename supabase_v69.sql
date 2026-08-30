-- =============================================================================
-- v69 · 검수를 실제로 물립니다
-- -----------------------------------------------------------------------------
-- v68 이 보류·기록·안내를 만들었지만 두 곳이 이어져 있지 않았습니다.
--
--   ① 기한이 지난 보류가 자동으로 안 지워집니다.
--      purge_held_animals() 는 만들었는데 부르는 곳이 없습니다. 매일 도는
--      purge_expired 가 함께 부르도록 잇습니다.
--
--   ② 보류된 개체를 회원이 다시 공개할 수 있습니다.
--      v68 은 보류할 때 is_public 을 false 로 내리기만 합니다. 회원이 화면에서
--      다시 켜면 그대로 풀립니다 — 우리가 내린 것을 회원이 되돌릴 수 있으면
--      보류가 아닙니다.
--
-- ② 를 어떻게 막나
--   public_animal 을 고치지 않습니다. v64 가 그 함수를 통째로 바꿔 두었고,
--   여기서 다시 쓰면 v64 의 CITES 처리를 옮겨 적어야 합니다 — 두 벌이 되고,
--   나중에 한쪽만 고쳐집니다. 대신 '보류 중에는 공개로 못 켠다' 는 문지기를
--   답니다. v64 의 animals_cites_guard 와 같은 방식입니다.
--
-- 선행: supabase_v68.sql
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.purge_held_animals()') is null then
    raise exception E'supabase_v68.sql 을 먼저 실행하세요.';
  end if;
end $guard$;

begin;

-- 1) 매일 도는 정리에 보류 만료를 붙입니다 ----------------------------------------------
/* v13 의 본문을 그대로 두고 한 덩어리만 더합니다. 기존 반환값에 held 를
   더해서, 어제 몇 건이 만료됐는지 cron.job_run_details 로 볼 수 있게 합니다. */
create or replace function public.purge_expired()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v int := 0; c int := 0; a int := 0; h int := 0;
begin
  perform public.roll_up_visits();

  delete from public.visits where ts < now() - interval '1 year';
  get diagnostics v = row_count;

  delete from public.combo_queries where ts < now() - interval '1 year';
  get diagnostics c = row_count;

  begin
    delete from public.consent_archive where purge_after < current_date;
    get diagnostics a = row_count;
  exception when undefined_table then a := 0;
  end;

  /* 보류 기한이 지난 개체의 사진을 지웁니다(v68). 확인 대기(purge_after 가
     null)인 것은 건드리지 않습니다 — 회원은 조치했는데 우리가 못 본 상태라
     여기서 지우면 회원이 우리 지연의 대가를 치릅니다. */
  begin
    h := public.purge_held_animals();
  exception when undefined_function then h := 0;
  end;

  return jsonb_build_object('visits', v, 'combo_queries', c, 'consent_archive', a,
                            'held', h, 'at', now());
end $$;


-- 2) 보류 중에는 다시 공개할 수 없습니다 --------------------------------------------------
/* 회원이 화면에서 공개를 켜는 것도, save_row 의 delete+insert 로 예전 값이
   되살아나는 것도 여기서 걸립니다. */
create or replace function public.animals_hold_public_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.held_at is not null
     and (coalesce(new.is_public, false) or coalesce(new.is_listed, false)) then
    raise exception 'ANIMAL_HELD' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists animals_hold_public_guard on public.animals;
create trigger animals_hold_public_guard
  before insert or update on public.animals
  for each row execute function public.animals_hold_public_guard();


-- 3) 보류 상태를 화면이 물어보는 창구 -----------------------------------------------------
/* 개체 화면이 배너를 띄우려면 '왜 보류됐는지' 를 알아야 합니다. 회원 본인
   것만 돌려줍니다. */
create or replace function public.my_animal_hold(p_animal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); a public.animals;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into a from public.animals where id = p_animal and user_id = u;
  if not found then raise exception 'ANIMAL_NOT_FOUND' using errcode = '42501'; end if;
  if a.held_at is null then return null; end if;

  return jsonb_build_object(
    'held_at',     a.held_at,
    'category',    a.held_category,
    'reason',      a.held_reason,
    /* null 이면 확인 대기입니다 — 회원은 조치했고 우리를 기다리는 중입니다. */
    'purge_after', a.purge_after,
    'waiting',     (a.purge_after is null));
end $$;


-- 4) 안 읽은 안내 (배지용) ----------------------------------------------------------
create or replace function public.my_moderation_notices()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'animal_id', n.animal_id, 'created_at', n.created_at,
           'action', l.action, 'category', l.category, 'reason', l.reason)
         order by n.created_at desc), '[]'::jsonb)
    from public.moderation_notices n
    left join public.moderation_log l on l.id = n.log_id
   where n.user_id = auth.uid() and n.seen_at is null;
$$;


-- 5) 권한 ----------------------------------------------------------------------
revoke all on function public.animals_hold_public_guard() from public, anon, authenticated;
revoke all on function public.my_animal_hold(uuid)        from public, anon;
revoke all on function public.my_moderation_notices()     from public, anon;

grant execute on function public.my_animal_hold(uuid)     to authenticated;
grant execute on function public.my_moderation_notices()  to authenticated;

commit;


-- 확인 -----------------------------------------------------------------------
select 1 as 순, '보류 만료가 정리에 물렸는가' as 검사,
       case when pg_get_functiondef(to_regprocedure('public.purge_expired()')::oid)
                 like '%purge_held_animals%' then 'OK' else '★ 안 물렸습니다' end as 판정
union all
select 2, '보류 중 공개 차단 트리거',
       case when exists (select 1 from pg_trigger
                          where tgname = 'animals_hold_public_guard' and not tgisinternal)
            then 'OK' else '★ MISSING' end
union all
select 3, '화면 창구',
       case when to_regprocedure('public.my_animal_hold(uuid)') is not null
             and to_regprocedure('public.my_moderation_notices()') is not null
            then 'OK' else '★ MISSING' end
order by 순;

-- 손으로 해 볼 것
--   개체 하나를 admin_hold_animal 로 보류한 뒤, 케어 화면에서 공개를 켜 보세요.
--   ANIMAL_HELD 로 거절되어야 합니다. 그게 v68 만으로는 안 막히던 부분입니다.
