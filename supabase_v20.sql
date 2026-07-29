/* =============================================================================
   supabase_v20.sql — 먹이·용품 관리 (사료 · 간식 · 특식 · 영양제)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v19.sql 이 먼저 적용돼 있어야 합니다.

   ---------------------------------------------------------------------------
   무엇을 만드나
   ---------------------------------------------------------------------------
   쓰는 사람이 자기가 실제로 먹이는 것을 직접 등록합니다. 브랜드도 제품도
   사람마다 다르고, 우리가 목록을 정해줄 수 있는 영역이 아닙니다.

       feed_items      내가 쓰는 먹이·간식·영양제 한 줄
       care_plans.feed_item_id   급여 계획이 어떤 먹이를 쓰는지

   급여 계획을 완료하면 그 먹이가 1회분만큼 줍니다. 남은 양과 급여 주기를
   알면 언제 떨어질지 계산할 수 있고, 그 날짜를 캘린더에 '주문 안내' 로
   내보냅니다. 알림을 캘린더에 맡기는 방식은 케어 일정과 같습니다.

   ---------------------------------------------------------------------------
   재고를 화면에서 깎지 않고 트리거로 깎는 이유
   ---------------------------------------------------------------------------
   화면에서 '기록을 남기고' → '재고를 줄인다' 두 번 부르면, 둘 사이에 통신이
   끊겼을 때 기록만 남고 재고는 그대로가 됩니다. 사용자는 알 수 없습니다.

   기록이 들어오는 순간 DB 가 같이 줄이면 그럴 일이 없습니다. 기록을 지우면
   되돌립니다. 재고는 '기록에서 나오는 값' 이지 따로 관리하는 값이 아닙니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.care_plans') is null then
    raise exception E'care_plans 가 없습니다.\nsupabase_v16.sql 을 먼저 실행하세요.';
  end if;
  if to_regprocedure('public.care_set_owner()') is null then
    raise exception E'care_set_owner() 가 없습니다.\nsupabase_v16.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. 먹이·용품 ────────────────────────────────────────────────────────
   단위를 고정하지 않습니다. CGD 는 g, 냉동 먹이는 마리, 영양제는 통입니다.
   무엇으로 세는지는 쓰는 사람이 정합니다.

   amount_full 은 '새로 사면 얼마인가' 입니다. 다 쓰고 새로 채울 때 이 값으로
   되돌립니다. 매번 몇 g 짜리를 샀는지 다시 적게 하지 않으려는 것입니다.

   lead_days 는 주문해서 도착할 때까지 걸리는 날입니다. 소진일에 알려주면
   이미 늦습니다 — 그만큼 앞당겨 알려줍니다. */
create table if not exists public.feed_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  name         text not null,
  kind         text not null default 'staple',
  brand        text,
  unit         text not null default 'g',
  per_use      numeric(10,2),          -- 1회 급여량
  amount_left  numeric(10,2),          -- 남은 양
  amount_full  numeric(10,2),          -- 새 것 기준 양
  opened_on    date,
  expires_on   date,                   -- 유통기한 또는 개봉 후 사용기한
  buy_url      text,
  lead_days    int not null default 3,
  note         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'feed_items_kind_ck') then
    alter table public.feed_items add constraint feed_items_kind_ck
      check (kind in ('staple','treat','special','supplement','substrate','other'));
  end if;
  /* 음수 재고는 뜻이 없습니다. 트리거가 0 아래로 안 내려가게 막지만,
     직접 적어 넣는 경우도 있어 제약으로도 둡니다. */
  if not exists (select 1 from pg_constraint where conname = 'feed_items_amount_ck') then
    alter table public.feed_items add constraint feed_items_amount_ck
      check ((amount_left  is null or amount_left  >= 0)
         and (amount_full  is null or amount_full  >= 0)
         and (per_use      is null or per_use      >  0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feed_items_lead_ck') then
    alter table public.feed_items add constraint feed_items_lead_ck
      check (lead_days between 0 and 90);
  end if;
end $ck$;

create index if not exists feed_items_user_idx on public.feed_items(user_id, is_active);


/* ── 2. 급여 계획이 어떤 먹이를 쓰는지 ───────────────────────────────────
   비워둘 수 있습니다. 먹이를 등록하지 않고 계획만 쓰는 사람도 있습니다.
   먹이를 지우면 계획은 남고 연결만 끊깁니다 — 계획까지 사라지면
   '왜 오늘 할 일이 줄었지' 가 됩니다. */
alter table public.care_plans
  add column if not exists feed_item_id uuid references public.feed_items(id) on delete set null;
create index if not exists care_plans_feed_idx on public.care_plans(feed_item_id);


/* ── 3. 권한 · RLS ───────────────────────────────────────────────────── */
revoke all on public.feed_items from anon;
grant select, insert, update, delete on public.feed_items to authenticated;
alter table public.feed_items enable row level security;

drop policy if exists feed_items_own on public.feed_items;
create policy feed_items_own on public.feed_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

/* user_id 는 서버가 채웁니다 (v16 의 care_set_owner 를 그대로 씁니다) */
drop trigger if exists feed_items_owner on public.feed_items;
create trigger feed_items_owner before insert on public.feed_items
  for each row execute function public.care_set_owner();

drop trigger if exists feed_items_touch on public.feed_items;
create trigger feed_items_touch before update on public.feed_items
  for each row execute function public.care_touch();


/* ── 4. 기록이 들어오면 재고가 줄고, 지우면 되돌아옵니다 ─────────────────
   care_records 에 plan_id 가 있고, 그 계획이 먹이를 가리키면 per_use 만큼
   줍니다. 0 아래로는 안 내려갑니다 — 음수 재고는 '얼마나 모자란지' 를
   뜻하지 않고 그냥 틀린 값입니다.

   ⚠️ 되돌릴 때 한계가 있습니다. 재고가 0 에서 멈춘 뒤 기록을 지우면, 실제로
      깎인 양보다 많이 돌아옵니다. 깎을 때 얼마나 깎았는지를 기록에 남기지
      않기 때문입니다. 그 값을 남기려면 care_records 에 칸을 하나 더해야 하고,
      이미 쌓인 기록에는 그 값이 없습니다. 지금은 이 오차를 받아들이고,
      재고는 '참고값' 으로 둡니다 — 정확한 수치가 필요하면 화면에서 직접
      고칠 수 있게 해두었습니다. */
create or replace function public.feed_apply_usage()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid; amt numeric;
begin
  pid := case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;
  if pid is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select p.feed_item_id, f.per_use
    into pid, amt
    from public.care_plans p
    join public.feed_items f on f.id = p.feed_item_id
   where p.id = pid;

  if pid is null or amt is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    update public.feed_items
       set amount_left = least(coalesce(amount_left, 0) + amt, coalesce(amount_full, coalesce(amount_left,0) + amt))
     where id = pid;
    return old;
  else
    update public.feed_items
       set amount_left = greatest(coalesce(amount_left, 0) - amt, 0)
     where id = pid and amount_left is not null;
    return new;
  end if;
end $$;

drop trigger if exists care_records_feed_use on public.care_records;
create trigger care_records_feed_use
  after insert or delete on public.care_records
  for each row execute function public.feed_apply_usage();


/* ── 5. 탈퇴할 때 같이 지웁니다 ──────────────────────────────────────────
   ⚠️ v16 에서 케어 표를 넣을 때와 같은 이유입니다. 빼먹으면 탈퇴한 사람의
      기록이 남습니다. v19 까지의 내용을 그대로 두고 한 줄만 더했습니다. */
create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        dev text;
        p   public.profiles;
begin
  if uid is null then raise exception 'not signed in'; end if;
  dev := 'u_' || uid::text;

  select * into p from public.profiles where user_id = uid;
  if found then
    insert into public.consent_archive
      (user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
       agree_mkt_email, agree_mkt_sms, agree_ai_train, consent_at, purge_after)
    values
      (md5(uid::text || '|reptile-withdrawn'),
       p.agree_terms, p.agree_privacy, p.agree_age14, p.agree_third,
       p.agree_mkt_email, p.agree_mkt_sms, p.agree_ai_train, p.consent_at,
       (now() + interval '5 years')::date);
  end if;

  delete from public.weight_logs  where user_id = uid;
  delete from public.care_records where user_id = uid;
  delete from public.care_plans   where user_id = uid;
  delete from public.feed_items   where user_id = uid;   -- v20

  delete from public.clutches where user_id = uid or device = dev;
  delete from public.pairings where user_id = uid or device = dev;
  delete from public.animals  where user_id = uid or device = dev;

  update public.access_codes set revoked = true where redeemed_by = dev;

  delete from public.profiles where user_id = uid;
  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;


/* ── 6. 확인 ─────────────────────────────────────────────────────────── */
select '표' as 항목, c.relname as 이름, c.relrowsecurity as rls켜짐,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as 정책수
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname = 'feed_items';

select '트리거' as 항목, tgname as 이름 from pg_trigger
 where tgrelid in ('public.feed_items'::regclass, 'public.care_records'::regclass)
   and not tgisinternal order by 2;

select '계획-먹이 연결 칼럼' as 항목, count(*) as 있음
  from information_schema.columns
 where table_schema='public' and table_name='care_plans' and column_name='feed_item_id';
