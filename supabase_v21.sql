/* =============================================================================
   supabase_v21.sql — 기록이 남의 계획을 가리킬 수 없게 막습니다
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v20.sql 이 먼저 적용돼 있어야 합니다.

   ---------------------------------------------------------------------------
   무엇이 뚫려 있었나
   ---------------------------------------------------------------------------
   care_records 의 정책(v16)은 두 가지를 봅니다.

       user_id 가 나인가
       animal_id 가 내 개체인가

   plan_id 는 보지 않았습니다. 즉 남의 계획 id 를 알기만 하면, 내 이름으로
   그 계획을 가리키는 기록을 만들 수 있었습니다. id 가 무작위 UUID 라 찍기는
   어렵지만, '어렵다' 는 정책이 아닙니다. 이걸 두면 두 가지가 생깁니다.

     1. 재고 조작 — v20 의 재고 트리거는 security definer 라 정책을 통과해
        계획에 연결된 먹이를 깎습니다. 남의 계획을 가리킨 기록이 들어오면
        **남의 재고**가 깎입니다. 기록을 지우면 다시 채워지므로, 남의 재고를
        마음대로 올렸다 내렸다 할 수 있습니다.

     2. 완료 방해 — (plan_id, done_date) 유일 색인 때문에, 남의 계획에 오늘
        날짜 기록을 먼저 꽂아두면 **주인이 자기 할 일을 완료할 수 없습니다.**
        화면에는 '이미 오늘 처리한 항목' 이라고만 떠서, 주인은 뭐가 잘못됐는지
        알 길이 없습니다.

   v20 을 만들며 트리거가 계획을 따라간다는 것까지 만들어 놓고, 그 계획이
   누구 것인지 묻는 걸 확인하지 않았습니다. 이 파일이 그 확인을 넣습니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.feed_items') is null then
    raise exception E'feed_items 가 없습니다.\nsupabase_v20.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. care_records 정책에 plan 소유 확인을 더합니다 ────────────────────
   animal_id 확인(v16)은 그대로 두고 plan_id 확인을 나란히 둡니다.
   plan_id 가 비어 있는 기록(계획 없이 그냥 남긴 것)은 지금처럼 됩니다. */
drop policy if exists care_records_own on public.care_records;
create policy care_records_own on public.care_records
  for all to authenticated
  using (
    user_id = auth.uid()
    and ( animal_id is null or exists (
          select 1 from public.animals a
           where a.id = care_records.animal_id and a.user_id = auth.uid()) )
    and ( plan_id is null or exists (
          select 1 from public.care_plans p
           where p.id = care_records.plan_id and p.user_id = auth.uid()) )
  )
  with check (
    user_id = auth.uid()
    and ( animal_id is null or exists (
          select 1 from public.animals a
           where a.id = care_records.animal_id and a.user_id = auth.uid()) )
    and ( plan_id is null or exists (
          select 1 from public.care_plans p
           where p.id = care_records.plan_id and p.user_id = auth.uid()) )
  );


/* ── 2. 이미 들어간 어긋난 기록 정리 ─────────────────────────────────────
   주인이 다른 계획을 가리키는 기록이 이미 있다면 연결만 끊습니다.
   기록 자체는 그 사람 것이므로 지우지 않습니다. */
update public.care_records r
   set plan_id = null
 where plan_id is not null
   and not exists (select 1 from public.care_plans p
                    where p.id = r.plan_id and p.user_id = r.user_id);


/* ── 3. 재고 트리거에도 같은 확인을 넣습니다 (겹벽) ──────────────────────
   정책이 막아주지만, 트리거는 security definer 라 정책 밖에서 돕니다.
   나중에 누가 다른 경로(관리자 함수 등)로 기록을 넣게 만들면 정책을 안
   거칠 수 있습니다. 트리거 스스로도 '기록 주인 = 계획 주인' 일 때만
   깎게 해서, 정책이 뚫려도 남의 재고는 안 움직이게 합니다. */
create or replace function public.feed_apply_usage()
returns trigger language plpgsql security definer set search_path = public as $$
declare rec record; fid uuid; amt numeric; owner uuid;
begin
  rec := case when tg_op = 'DELETE' then old else new end;
  if rec.plan_id is null then return rec; end if;

  select p.feed_item_id, f.per_use, p.user_id
    into fid, amt, owner
    from public.care_plans p
    join public.feed_items f on f.id = p.feed_item_id
   where p.id = rec.plan_id;

  if fid is null or amt is null then return rec; end if;
  /* 기록 주인과 계획 주인이 다르면 아무것도 하지 않습니다 */
  if owner is distinct from rec.user_id then return rec; end if;

  if tg_op = 'DELETE' then
    update public.feed_items
       set amount_left = least(coalesce(amount_left, 0) + amt,
                               coalesce(amount_full, coalesce(amount_left, 0) + amt))
     where id = fid;
    return old;
  else
    update public.feed_items
       set amount_left = greatest(coalesce(amount_left, 0) - amt, 0)
     where id = fid and amount_left is not null;
    return new;
  end if;
end $$;


/* ── 4. 구매처 주소는 http(s) 만 ─────────────────────────────────────────
   화면(care-ui.js)도 거르지만, API 로 직접 넣으면 화면 검사는 안 거칩니다.
   javascript: 같은 값이 들어가 있으면 '사러 가기' 를 누르는 순간 실행됩니다.
   자기 데이터라 자기만 다치는 자리지만, 막는 데 한 줄이면 됩니다. */
do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'feed_items_url_ck') then
    alter table public.feed_items add constraint feed_items_url_ck
      check (buy_url is null or buy_url ~* '^https?://');
  end if;
end $ck$;

/* 혹시 이미 들어간 이상한 주소는 지웁니다 */
update public.feed_items set buy_url = null
 where buy_url is not null and buy_url !~* '^https?://';


/* ── 5. 확인 ─────────────────────────────────────────────────────────── */
select '정책' as 항목, polname as 이름,
       case when pg_get_expr(polqual, polrelid) like '%care_plans%' then '✅ plan 소유 확인함'
            else '⚠️ plan 확인 없음' end as 상태
  from pg_policy
 where polrelid = 'public.care_records'::regclass;

select '어긋난 기록' as 항목, count(*) as 남은건수
  from public.care_records r
 where plan_id is not null
   and not exists (select 1 from public.care_plans p
                    where p.id = r.plan_id and p.user_id = r.user_id);

select 'URL 제약' as 항목, count(*) as 있음
  from pg_constraint where conname = 'feed_items_url_ck';
