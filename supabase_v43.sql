/* =============================================================================
   supabase_v43.sql — 급여 관련 RLS 평가 최적화
   -----------------------------------------------------------------------------
   auth.uid()를 행마다 다시 계산하지 않도록 initPlan 형태로 고정합니다.
   소유권 규칙 자체는 v42와 같습니다.
   ============================================================================= */

begin;

drop policy if exists feed_items_own on public.feed_items;
create policy feed_items_own on public.feed_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

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

commit;

