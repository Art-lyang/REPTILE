/* =============================================================================
   supabase_v16.sql — 케어 기록 (급여·청소·영양제·체중)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v14.sql 까지 먼저 적용돼 있어야 합니다.

   ---------------------------------------------------------------------------
   무엇을 만드나
   ---------------------------------------------------------------------------
     animals.species    개체가 어떤 종인지 (레오파드·크레스티드·팻테일·피그미…)
     care_plans         반복 케어 계획 — "3일마다 급여", "월·목 칼슘"
     care_records       실제로 한 일 1건
     weight_logs        체중 1건

   계산기(모프)와 달리 이건 매일 쓰는 기록입니다. 그래서 설계 기준이 다릅니다.

   ---------------------------------------------------------------------------
   왜 my_rows / save_row 를 쓰지 않는가
   ---------------------------------------------------------------------------
   기존 사육 기록은 RPC 세 개(my_rows·save_row·delete_row)를 거칩니다.
   로그인하지 않은 기기 사용자도 쓸 수 있게 하려고 그렇게 만든 것입니다.
   케어 기록에는 그 방식이 맞지 않습니다.

     · my_rows 는 표의 모든 행을 jsonb 한 덩어리로 내려줍니다. 개체 20마리에
       하루 3건씩 1년이면 2만 건입니다. 화면이 열리지 않습니다.
     · save_row 는 수정할 때 행을 지우고 다시 넣습니다. 계속 쌓이기만 하는
       기록에는 과한 방식입니다.

   그래서 케어 표는 표준 RLS 로 직접 접근합니다. 대신 로그인이 필수입니다.
   어차피 프리미엄 기능이라 제약이 아니고, 오히려 device 문자열을 믿어야 하는
   구조가 사라져서 더 단단해집니다.

   ---------------------------------------------------------------------------
   ⚠️ animals 에 '본인 읽기' 를 엽니다
   ---------------------------------------------------------------------------
   v6 이 animals 를 관리자만 직접 볼 수 있게 잠갔습니다. 그런데 아래 케어 표의
   RLS 는 "이 개체가 내 것인가" 를 animals 를 조회해서 확인합니다. 정책 안의
   조회에도 RLS 가 걸리므로, 지금 상태로는 그 확인이 항상 거짓이 되어 케어
   기록을 아무도 읽지 못합니다.

   그래서 animals 에 select 정책을 하나 더 답니다. 조건은 user_id = auth.uid()
   입니다 — 이미 my_rows 로 볼 수 있던 것과 정확히 같은 행이라, 새로 열리는
   것은 없습니다. 쓰기는 열지 않습니다. 등록·수정은 계속 save_row 를 씁니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception E'animals 표가 없습니다.\nsupabase_setup.sql 을 먼저 실행하세요.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception E'is_admin() 이 없습니다.\nsupabase_v2.sql → v3.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. 개체에 종(species) 붙이기 ────────────────────────────────────────
   지금 animals 는 레오파드 전용입니다(morphs·hets·color_grade). 케어 앱은
   종을 가리지 않으므로 구분이 필요합니다.

   기본값을 'leopard' 로 둡니다. 지금 들어 있는 기록은 전부 레오파드 계산기의
   브리딩 관리에서 만들어진 것이라 그렇게 보는 것이 맞습니다.

   docs/STUDIO.md 3.1 에 service 칼럼을 두고 한 이야기와 같습니다 —
   나중에 붙이면 그 전 데이터는 영영 구분할 수 없습니다. */
alter table public.animals add column if not exists species text not null default 'leopard';
create index if not exists animals_species_idx on public.animals(species);


/* ── 2. animals 본인 읽기 ────────────────────────────────────────────────
   위 머리말에 적은 이유로 select 만 엽니다. v6 이 만든 animals_admin 정책은
   그대로 둡니다. 정책은 OR 로 합쳐지므로 관리자 접근은 영향받지 않습니다.

   user_id 가 비어 있는 행(로그인 안 한 기기 소유)은 여기에 걸리지 않습니다.
   그건 계속 my_rows 로만 봅니다. device 는 브라우저가 보내는 문자열이라
   정책 조건으로 쓸 수 없습니다 — 아무 값이나 적어 넣을 수 있으니까요. */
drop policy if exists animals_own_read on public.animals;
create policy animals_own_read on public.animals
  for select to authenticated
  using (user_id is not null and user_id = auth.uid());


/* ── 3. 반복 케어 계획 ───────────────────────────────────────────────────
   "3일마다 급여", "월·목 칼슘 더스팅", "매주 체중" 같은 것을 담습니다.

   반복 방식이 두 가지입니다. 파충류 사육에는 둘 다 필요합니다.

     interval_days = 3      3일마다   (레오파드 성체 급여)
     weekdays = {1,4}       월·목     (칼슘 더스팅)

   이 두 가지로 정한 이유 — 캘린더 표준(RFC 5545)의 반복 규칙과 1:1 로
   맞아떨어집니다.

     interval_days=3  →  FREQ=DAILY;INTERVAL=3
     weekdays={1,4}   →  FREQ=WEEKLY;BYDAY=MO,TH

   그래서 .ics 파일을 만들 때 값을 옮겨 담기만 하면 됩니다. 사용자 폰의
   캘린더가 알림을 대신 울려주므로, 우리 쪽에 알림 서버가 필요 없습니다.

   weekdays 는 0=일요일 … 6=토요일 입니다. 자바스크립트 getDay() 와 같은
   기준입니다. 화면에서 변환하다가 하루씩 밀리는 사고를 막으려고 맞췄습니다.

   animal_id 가 비어 있으면 '개체 공통' 입니다. 랙 전체 청소처럼 특정 개체에
   매이지 않는 일이 실제로 있습니다. */
create table if not exists public.care_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  animal_id     uuid references public.animals(id) on delete cascade,
  kind          text not null,
  title         text,
  detail        text,                       -- 먹이 종류, 영양제 이름 등
  interval_days int,                        -- N일마다
  weekdays      int[],                      -- 0=일 … 6=토
  start_date    date not null default current_date,
  time_of_day   time,                       -- 캘린더에 넣을 시각. 비면 종일 일정
  is_active     boolean not null default true,
  last_done_date date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

/* 제약은 표를 만든 뒤 따로 붙입니다. 이미 표가 있는 상태에서 다시 실행해도
   같은 제약이 적용되게 하기 위해서입니다. */
do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'care_plans_kind_ck') then
    alter table public.care_plans add constraint care_plans_kind_ck
      check (kind in ('feed','water','clean','bedding','supplement','weigh','health','custom'));
  end if;

  /* 반복 방식은 둘 중 하나만. 둘 다 채우면 어느 쪽을 따를지 코드마다 달라지고,
     둘 다 비면 영영 돌아오지 않는 계획이 됩니다. */
  if not exists (select 1 from pg_constraint where conname = 'care_plans_cycle_ck') then
    alter table public.care_plans add constraint care_plans_cycle_ck
      check ( (interval_days is not null and weekdays is null)
           or (interval_days is null and weekdays is not null) );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'care_plans_interval_ck') then
    alter table public.care_plans add constraint care_plans_interval_ck
      check (interval_days is null or (interval_days between 1 and 365));
  end if;

  /* 요일은 0~6 만. 7 이나 -1 이 들어오면 화면에서 조용히 안 뜨는 계획이 됩니다. */
  if not exists (select 1 from pg_constraint where conname = 'care_plans_weekdays_ck') then
    alter table public.care_plans add constraint care_plans_weekdays_ck
      check (weekdays is null or (
             array_length(weekdays,1) between 1 and 7
             and weekdays <@ array[0,1,2,3,4,5,6]));
  end if;
end $ck$;

create index if not exists care_plans_user_idx   on public.care_plans(user_id, is_active);
create index if not exists care_plans_animal_idx on public.care_plans(animal_id);


/* ── 4. 케어 기록 ────────────────────────────────────────────────────────
   실제로 한 일 1건입니다. plan_id 가 있으면 계획을 수행한 것이고,
   비어 있으면 그냥 그날 남긴 기록입니다.

   done_date 는 '한 날' 입니다. created_at(적어 넣은 시각)과 다릅니다.
   어제 한 걸 오늘 적는 일이 흔해서 나눠 둡니다. */
create table if not exists public.care_records (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  animal_id  uuid references public.animals(id) on delete cascade,
  plan_id    uuid references public.care_plans(id) on delete set null,
  kind       text not null,
  done_date  date not null default current_date,
  title      text,
  detail     text,
  note       text,
  created_at timestamptz not null default now()
);

do $ck2$
begin
  if not exists (select 1 from pg_constraint where conname = 'care_records_kind_ck') then
    alter table public.care_records add constraint care_records_kind_ck
      check (kind in ('feed','water','clean','bedding','supplement','weigh','health','memo','behavior','custom'));
  end if;
end $ck2$;

create index if not exists care_records_user_date_idx   on public.care_records(user_id, done_date desc);
create index if not exists care_records_animal_date_idx on public.care_records(animal_id, done_date desc);

/* 계획 하나는 하루에 한 번만 완료됩니다.
   화면에서도 막지만, 그것만으로는 부족합니다 — 버튼을 빠르게 두 번 누르면
   두 요청이 동시에 날아가고, 둘 다 "아직 안 했네" 를 보고 지나갑니다.
   여기서 막아야 확실히 막힙니다.

   plan_id 가 없는 기록에는 걸리지 않습니다. 하루에 두 번 급여하고 두 번
   적는 것은 정상이니까요. */
create unique index if not exists care_records_plan_once_a_day
  on public.care_records(plan_id, done_date)
  where plan_id is not null;


/* ── 5. 체중 ─────────────────────────────────────────────────────────────
   단위를 g 하나로 고정합니다. kg 를 함께 받으면 언젠가 섞여 들어오고,
   그러면 그래프가 조용히 틀립니다 — 쓰는 사람이 알아채기 어려운 오류입니다.
   레오파드 40~100g, 크레스티드 35~60g, 피그미다람쥐 100g 안팎이라
   g 하나로 다 담깁니다.

   하루 한 번만 받습니다. 같은 날 다시 재면 덮어씁니다. 아침저녁으로 재서
   두 값이 남으면 '증감' 이 무엇을 뜻하는지 알 수 없게 됩니다. */
create table if not exists public.weight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  animal_id   uuid not null references public.animals(id) on delete cascade,
  grams       numeric(8,2) not null,
  measured_on date not null default current_date,
  note        text,
  created_at  timestamptz not null default now(),
  unique (animal_id, measured_on)
);

do $ck3$
begin
  /* 위쪽은 실수 방지용입니다. 0.5g 을 500g 으로 잘못 적으면 그래프가 망가지고,
     아래 주간 리포트의 '체중 감소' 판정도 같이 망가집니다. */
  if not exists (select 1 from pg_constraint where conname = 'weight_logs_grams_ck') then
    alter table public.weight_logs add constraint weight_logs_grams_ck
      check (grams > 0 and grams < 10000);
  end if;
end $ck3$;

create index if not exists weight_logs_animal_idx on public.weight_logs(animal_id, measured_on desc);


/* ── 6. 접근 권한 ────────────────────────────────────────────────────────
   anon 은 아예 못 씁니다. 로그인해야만 쓸 수 있는 표입니다. */
revoke all on public.care_plans   from anon;
revoke all on public.care_records from anon;
revoke all on public.weight_logs  from anon;
grant select, insert, update, delete on public.care_plans   to authenticated;
grant select, insert, update, delete on public.care_records to authenticated;
grant select, insert, update, delete on public.weight_logs  to authenticated;

alter table public.care_plans   enable row level security;
alter table public.care_records enable row level security;
alter table public.weight_logs  enable row level security;


/* ── 7. RLS ──────────────────────────────────────────────────────────────
   두 겹으로 봅니다.

     1) user_id 가 나인가
     2) 가리키는 개체가 내 것인가  (animal_id 가 있을 때만)

   1번만 있어도 대부분 막힙니다. 2번을 더 두는 이유는, 남의 개체 id 를 적어
   넣은 기록을 만들 수 없게 하기 위해서입니다. 그런 행이 생기면 소유자에게는
   안 보이면서 DB 에는 남아, 나중에 개체를 지울 때 딸려 지워지지도 않습니다.

   animal_id 가 비어 있는 것은 '개체 공통' 이라 1번만 봅니다. */
do $rls$
declare t text;
begin
  foreach t in array array['care_plans','care_records'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format($p$
      create policy %I_own on public.%I
        for all to authenticated
        using (
          user_id = auth.uid()
          and ( animal_id is null or exists (
                select 1 from public.animals a
                 where a.id = %I.animal_id and a.user_id = auth.uid()) )
        )
        with check (
          user_id = auth.uid()
          and ( animal_id is null or exists (
                select 1 from public.animals a
                 where a.id = %I.animal_id and a.user_id = auth.uid()) )
        )
    $p$, t, t, t, t);
  end loop;
end $rls$;

/* 체중은 개체가 반드시 있어야 합니다 — '개체 공통 체중' 은 없으니까요. */
drop policy if exists weight_logs_own on public.weight_logs;
create policy weight_logs_own on public.weight_logs
  for all to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.animals a
                 where a.id = weight_logs.animal_id and a.user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.animals a
                 where a.id = weight_logs.animal_id and a.user_id = auth.uid())
  );


/* ── 8. user_id 를 서버가 채웁니다 ───────────────────────────────────────
   화면이 user_id 를 실어 보내지 않아도 되게 합니다. with check 가 어차피
   남의 id 를 막지만, 안 보내도 되면 화면 코드에서 빠뜨릴 일이 없습니다.

   보내온 값이 있어도 덮어씁니다. auth.uid() 는 Supabase 가 검증한 값이라
   위조할 수 없습니다. */
create or replace function public.care_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  if new.user_id is null then
    raise exception '로그인이 필요합니다';
  end if;
  return new;
end $$;

do $trg$
declare t text;
begin
  foreach t in array array['care_plans','care_records','weight_logs'] loop
    execute format('drop trigger if exists %I_owner on public.%I', t, t);
    execute format('create trigger %I_owner before insert on public.%I
                    for each row execute function public.care_set_owner()', t, t);
  end loop;
end $trg$;

/* care_plans.updated_at 자동 갱신 */
create or replace function public.care_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists care_plans_touch on public.care_plans;
create trigger care_plans_touch before update on public.care_plans
  for each row execute function public.care_touch();


/* ── 9. 탈퇴할 때 같이 지우기 ────────────────────────────────────────────
   ⚠️ 이걸 빼먹으면 탈퇴한 사람의 사육 기록이 DB 에 남습니다. 개인정보라
   그냥 둘 수 없습니다.

   animal_id 가 있는 행은 animals 를 지울 때 cascade 로 따라 지워집니다.
   하지만 '개체 공통' 계획·기록은 animals 를 가리키지 않아 안 지워집니다.
   그래서 user_id 기준으로 한 번 더 지웁니다.

   v14 의 delete_my_account() 를 그대로 가져와 세 줄만 더했습니다. 함수를
   통째로 다시 만드는 것은, 앞에 삽입하는 방법이 없어서입니다. v14 이후에
   이 함수를 또 고쳤다면 그 내용을 여기 옮겨 적어야 합니다. */
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

  /* 케어 기록 — animals 보다 먼저 지웁니다. 순서가 뒤바뀌어도 cascade 가
     처리하지만, 개체 공통 행은 여기서만 지워지므로 명시해 둡니다. */
  delete from public.weight_logs  where user_id = uid;
  delete from public.care_records where user_id = uid;
  delete from public.care_plans   where user_id = uid;

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


/* ── 10. 확인 ────────────────────────────────────────────────────────────
   세 표가 모두 rls=t 여야 하고, 정책이 각각 1개 이상 있어야 합니다.
   정책이 0개인데 RLS 가 켜져 있으면 본인도 못 읽습니다. */
select '표' as 항목, c.relname as 이름, c.relrowsecurity as rls켜짐,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as 정책수
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('care_plans','care_records','weight_logs','animals')
 order by 2;

select '개체 종별' as 항목, species as 종, count(*) as 마리
  from public.animals group by species order by 2;
