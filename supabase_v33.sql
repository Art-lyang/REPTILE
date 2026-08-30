/* =============================================================================
   supabase_v33.sql — 케어 계획에 "주 N회" 반복 방식을 추가합니다
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ 현재 라이브 기준인 supabase_v32.sql 이후에 적용하세요.

   ---------------------------------------------------------------------------
   무엇이 달라지나
   ---------------------------------------------------------------------------
   지금까지 계획의 반복 방식은 두 가지였습니다.

     interval_days = 3      3일마다
     weekdays = {1,4}       월·목처럼 정해진 요일마다

   여기에 weekly_target = 3, 즉 "요일은 상관없이 한 주에 3회"를 더합니다.
   세 방식은 해석이 서로 다르므로 한 계획에는 정확히 하나만 들어갑니다.

   기존 행은 이미 interval_days 와 weekdays 중 하나만 갖도록 제한되어 있어
   weekly_target 을 NULL 로 추가해도 뜻이 바뀌지 않습니다. 하루 한 번 완료
   유일 색인은 유지하고, 사료 연결의 소유권 검사는 더 엄격하게 보강합니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.care_plans') is null
     or to_regclass('public.care_records') is null
     or to_regclass('public.feed_items') is null then
    raise exception E'케어 표가 없습니다.\nsupabase_v16.sql 을 먼저 실행하세요.';
  end if;
end
$guard$;


/* ── 1. 주간 목표 횟수 ──────────────────────────────────────────────────
   smallint 면 1~7 을 담기에 충분합니다. NULL 은 다른 반복 방식을 쓴다는
   뜻이므로 기본값을 두지 않습니다. 기존 행도 그대로 NULL 을 받습니다. */
alter table public.care_plans
  add column if not exists weekly_target smallint;


/* ── 2. 반복 방식과 범위 제약 ────────────────────────────────────────────
   v16 의 care_plans_cycle_ck 는 두 칼럼만 봅니다. 이름을 새로 만들면 옛 제약과
   새 제약이 동시에 걸려 weekly_target 행이 모두 막히므로, 기존 이름을 안전하게
   내렸다가 세 방식 기준으로 다시 만듭니다. 재실행할 때도 같은 결과입니다. */
alter table public.care_plans
  drop constraint if exists care_plans_cycle_ck;
alter table public.care_plans
  add constraint care_plans_cycle_ck
  check (num_nonnulls(interval_days, weekdays, weekly_target) = 1);

alter table public.care_plans
  drop constraint if exists care_plans_weekly_target_ck;
alter table public.care_plans
  add constraint care_plans_weekly_target_ck
  check (weekly_target is null or weekly_target between 1 and 7);

alter table public.care_plans
  drop constraint if exists care_plans_weekdays_ck;
alter table public.care_plans
  add constraint care_plans_weekdays_ck
  check (
    weekdays is null
    or (
      cardinality(weekdays) between 1 and 7
      and weekdays <@ array[0,1,2,3,4,5,6]
    )
  );


/* ── 3. 사료 연결 소유권 보강 ───────────────────────────────────────────
   UUID 를 알고 있더라도 다른 계정의 사료를 계획에 연결하거나, 완료 기록을
   통해 그 재고를 차감할 수 없게 정책과 트리거에서 각각 확인합니다. */
update public.care_plans plan
   set feed_item_id = null
 where feed_item_id is not null
   and not exists (
     select 1
       from public.feed_items feed
      where feed.id = plan.feed_item_id
        and feed.user_id = plan.user_id
   );

drop policy if exists care_plans_own on public.care_plans;
create policy care_plans_own on public.care_plans
  for all to authenticated
  using (
    user_id = auth.uid()
    and (
      animal_id is null
      or exists (
        select 1 from public.animals animal
         where animal.id = care_plans.animal_id
           and animal.user_id = auth.uid()
      )
    )
    and (
      feed_item_id is null
      or exists (
        select 1 from public.feed_items feed
         where feed.id = care_plans.feed_item_id
           and feed.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and (
      animal_id is null
      or exists (
        select 1 from public.animals animal
         where animal.id = care_plans.animal_id
           and animal.user_id = auth.uid()
      )
    )
    and (
      feed_item_id is null
      or exists (
        select 1 from public.feed_items feed
         where feed.id = care_plans.feed_item_id
           and feed.user_id = auth.uid()
      )
    )
  );

create or replace function public.feed_apply_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  fid uuid;
  amount numeric;
  owner_id uuid;
  feed_owner_id uuid;
begin
  rec := case when tg_op = 'DELETE' then old else new end;
  if rec.plan_id is null then return rec; end if;

  select plan.feed_item_id, feed.per_use, plan.user_id, feed.user_id
    into fid, amount, owner_id, feed_owner_id
    from public.care_plans plan
    join public.feed_items feed on feed.id = plan.feed_item_id
   where plan.id = rec.plan_id;

  if fid is null or amount is null
     or owner_id is distinct from rec.user_id
     or feed_owner_id is distinct from rec.user_id then
    return rec;
  end if;

  if tg_op = 'DELETE' then
    update public.feed_items
       set amount_left = least(coalesce(amount_left, 0) + amount,
                               coalesce(amount_full, coalesce(amount_left, 0) + amount))
     where id = fid and user_id = rec.user_id;
    return old;
  end if;

  update public.feed_items
     set amount_left = greatest(coalesce(amount_left, 0) - amount, 0)
   where id = fid and user_id = rec.user_id and amount_left is not null;
  return new;
end;
$$;
revoke all on function public.feed_apply_usage()
  from public, anon, authenticated;


/* ── 4. 연속 달성일 서버 집계 ───────────────────────────────────────────
   화면은 최근 기록만 내려받으므로 장기 연속 기록은 서버에서 계산합니다.
   오늘 할 일을 아직 끝내지 않았으면 어제까지의 연속 기록을 유지합니다. */
drop function if exists public.care_routine_streak(date);
create or replace function public.care_routine_streak()
returns integer
language sql
stable
set search_path = ''
as $$
with params as (
  select auth.uid() as account_id, current_date as end_date
), bounds as (
  select params.*,
         greatest(coalesce((
           select min(plan.start_date)
             from public.care_plans plan
            where plan.user_id = params.account_id
              and plan.is_active = true
              and plan.weekly_target is null
         ), params.end_date), params.end_date - 3650) as first_date
    from params
), scheduled as (
  select calendar.day::date as day,
         count(plan.id)::integer as due_count,
         count(record.id)::integer as done_count,
         bounds.end_date
    from bounds
    cross join lateral generate_series(
      bounds.first_date, bounds.end_date, interval '1 day'
    ) as calendar(day)
    join public.care_plans plan
      on plan.user_id = bounds.account_id
     and plan.is_active = true
     and plan.weekly_target is null
     and plan.start_date <= calendar.day::date
     and (
       (plan.weekdays is not null
        and extract(dow from calendar.day)::integer = any(plan.weekdays))
       or
       (plan.interval_days is not null
        and mod(calendar.day::date - plan.start_date, plan.interval_days) = 0)
     )
    left join public.care_records record
      on record.user_id = bounds.account_id
     and record.plan_id = plan.id
     and record.done_date = calendar.day::date
   where bounds.account_id is not null
   group by calendar.day, bounds.end_date
), eligible as (
  select day,
         done_count = due_count as complete,
         row_number() over (order by day desc) as position
    from scheduled
   where not (day = end_date and done_count < due_count)
)
select coalesce(
  (min(position) filter (where not complete) - 1)::integer,
  count(*)::integer
)
from eligible;
$$;
revoke all on function public.care_routine_streak() from public, anon;
grant execute on function public.care_routine_streak() to authenticated;


/* ── 5. 확인 ─────────────────────────────────────────────────────────────
   첫 표에는 weekly_target 이 smallint 로, 둘째 표에는 새 두 제약이 보여야 합니다.
   마지막 표는 이번 변경이 기존 보안·완료 계약을 그대로 두었는지 확인합니다. */
select '칼럼' as 항목, column_name as 이름, data_type as 자료형,
       is_nullable as null허용
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'care_plans'
   and column_name = 'weekly_target';

select '제약' as 항목, conname as 이름,
       pg_get_constraintdef(oid) as 내용
  from pg_constraint
 where conrelid = 'public.care_plans'::regclass
   and conname in ('care_plans_cycle_ck', 'care_plans_weekdays_ck',
                   'care_plans_weekly_target_ck')
 order by conname;

select 점검항목, case when 유지됨 then '✅ 유지' else '❌ 확인 필요' end as 상태
  from (
    values
      ('care_plans RLS',
       (select relrowsecurity from pg_class where oid = 'public.care_plans'::regclass)),
      ('care_records RLS',
       (select relrowsecurity from pg_class where oid = 'public.care_records'::regclass)),
      ('care_plans_own 정책',
       exists (select 1 from pg_policies where schemaname = 'public'
                and tablename = 'care_plans' and policyname = 'care_plans_own')),
      ('care_records_own 정책',
       exists (select 1 from pg_policies where schemaname = 'public'
                and tablename = 'care_records' and policyname = 'care_records_own')),
      ('care_plans_owner 트리거',
       exists (select 1 from pg_trigger where tgrelid = 'public.care_plans'::regclass
                and tgname = 'care_plans_owner' and not tgisinternal)),
      ('care_records_owner 트리거',
       exists (select 1 from pg_trigger where tgrelid = 'public.care_records'::regclass
                and tgname = 'care_records_owner' and not tgisinternal)),
      ('care_records_plan_once_a_day 유일 색인',
       exists (select 1 from pg_indexes where schemaname = 'public'
                and tablename = 'care_records'
                and indexname = 'care_records_plan_once_a_day')),
      ('care_routine_streak 함수',
       to_regprocedure('public.care_routine_streak()') is not null)
  ) as 확인(점검항목, 유지됨);
