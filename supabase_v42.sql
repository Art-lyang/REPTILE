/* =============================================================================
   supabase_v42.sql — 파충류 급여 기록 구조화
   -----------------------------------------------------------------------------
   급여 당시의 먹이 이름·종류·상태·제공량·섭취량을 care_records 에 스냅샷으로
   보관합니다. 먹이 재고 이름을 바꾸거나 항목을 지워도 과거 기록은 그대로
   읽을 수 있습니다. 기존의 한 줄짜리 급여 기록은 계속 유효합니다.
   ============================================================================= */

begin;

do $guard$
begin
  if to_regclass('public.care_records') is null
     or to_regclass('public.feed_items') is null then
    raise exception 'care tables are missing; apply the care schema first';
  end if;
end $guard$;

alter table public.care_records
  add column if not exists feed_item_id uuid references public.feed_items(id) on delete set null,
  add column if not exists feed_name text,
  add column if not exists feed_category text,
  add column if not exists feed_state text,
  add column if not exists offered_amount numeric(10,2),
  add column if not exists eaten_amount numeric(10,2),
  add column if not exists feed_unit text,
  add column if not exists feeding_result text;

alter table public.care_records
  drop constraint if exists care_records_feed_category_ck;
alter table public.care_records
  add constraint care_records_feed_category_ck
  check (feed_category is null or feed_category in
    ('prepared','insect','whole_prey','plant','supplement','other'));

alter table public.care_records
  drop constraint if exists care_records_feed_state_ck;
alter table public.care_records
  add constraint care_records_feed_state_ck
  check (feed_state is null or feed_state in
    ('ready','live','frozen','thawed','powder','mixed','fresh','other'));

alter table public.care_records
  drop constraint if exists care_records_feed_unit_ck;
alter table public.care_records
  add constraint care_records_feed_unit_ck
  check (feed_unit is null or char_length(btrim(feed_unit)) between 1 and 24);

alter table public.care_records
  drop constraint if exists care_records_feeding_result_ck;
alter table public.care_records
  add constraint care_records_feeding_result_ck
  check (feeding_result is null or feeding_result in ('all','partial','refused','unknown'));

alter table public.care_records
  drop constraint if exists care_records_feed_amount_ck;
alter table public.care_records
  add constraint care_records_feed_amount_ck
  check (
    (offered_amount is null and eaten_amount is null)
    or (
      offered_amount > 0
      and (eaten_amount is null or (eaten_amount >= 0 and eaten_amount <= offered_amount))
    )
  );

alter table public.care_records
  drop constraint if exists care_records_feed_shape_ck;
alter table public.care_records
  add constraint care_records_feed_shape_ck
  check (
    (
      feed_name is null and feed_category is null and feed_state is null
      and offered_amount is null and eaten_amount is null and feed_unit is null
      and feeding_result is null
    )
    or (
      kind = 'feed'
      and char_length(btrim(feed_name)) between 1 and 120
      and feed_category is not null and feed_state is not null
      and offered_amount is not null and feed_unit is not null and feeding_result is not null
      and (
        (feeding_result = 'unknown' and eaten_amount is null)
        or (feeding_result = 'all' and eaten_amount = offered_amount)
        or (feeding_result = 'partial' and eaten_amount > 0 and eaten_amount < offered_amount)
        or (feeding_result = 'refused' and eaten_amount = 0)
      )
    )
  );

create index if not exists care_records_feed_item_idx
  on public.care_records(feed_item_id)
  where feed_item_id is not null;

drop policy if exists care_records_own on public.care_records;
create policy care_records_own on public.care_records
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and (
      animal_id is null
      or exists (
        select 1 from public.animals a
         where a.id = care_records.animal_id and a.user_id = (select auth.uid())
      )
    )
    and (
      plan_id is null
      or exists (
        select 1 from public.care_plans p
         where p.id = care_records.plan_id and p.user_id = (select auth.uid())
      )
    )
    and (
      feed_item_id is null
      or exists (
        select 1 from public.feed_items feed
         where feed.id = care_records.feed_item_id and feed.user_id = (select auth.uid())
      )
    )
  )
  with check (
    user_id = (select auth.uid())
    and (
      animal_id is null
      or exists (
        select 1 from public.animals a
         where a.id = care_records.animal_id and a.user_id = (select auth.uid())
      )
    )
    and (
      plan_id is null
      or exists (
        select 1 from public.care_plans p
         where p.id = care_records.plan_id and p.user_id = (select auth.uid())
      )
    )
    and (
      feed_item_id is null
      or exists (
        select 1 from public.feed_items feed
         where feed.id = care_records.feed_item_id and feed.user_id = (select auth.uid())
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
  rec public.care_records%rowtype;
  fid uuid;
  amount numeric;
  owner_id uuid;
  feed_owner_id uuid;
begin
  rec := case when tg_op = 'DELETE' then old else new end;
  if rec.kind <> 'feed' then return rec; end if;

  if rec.feed_item_id is not null then
    select feed.id,
           case
             when rec.offered_amount is not null and rec.feed_unit = feed.unit
               then rec.offered_amount
             else feed.per_use
           end,
           rec.user_id,
           feed.user_id
      into fid, amount, owner_id, feed_owner_id
      from public.feed_items feed
     where feed.id = rec.feed_item_id;
  elsif rec.plan_id is not null then
    select plan.feed_item_id, feed.per_use, plan.user_id, feed.user_id
      into fid, amount, owner_id, feed_owner_id
      from public.care_plans plan
      join public.feed_items feed on feed.id = plan.feed_item_id
     where plan.id = rec.plan_id;
  else
    return rec;
  end if;

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

drop trigger if exists care_records_feed_use on public.care_records;
create trigger care_records_feed_use
  after insert or delete on public.care_records
  for each row execute function public.feed_apply_usage();

commit;
