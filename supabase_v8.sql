/* =============================================================================
   supabase_v8.sql — 관리자를 둘로 나누기 (최고관리자 / 부관리자)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v7.sql 을 먼저 실행하세요.

   ---------------------------------------------------------------------------
   무엇이 바뀌나
   ---------------------------------------------------------------------------
   지금은 admins 표에 이메일이 있으면 전부 같은 권한입니다. 통계도, 회원
   개인정보도, 코드 발급도 다 됩니다. 부관리자에게 모프 정리를 맡기려면
   개인정보까지 같이 넘겨야 하는 상태입니다.

   admins 에 role 을 둡니다.

     owner (최고관리자)  전부
     staff (부관리자)    코드 발급 + 모프 추가·수정. 그 외에는 접근 불가

   부관리자가 볼 수 없는 것 — 회원 개인정보, 동의 기록, 접속 통계,
   조합 통계, 안내 문구, 관리자 명단, 계정 병합 이력, 남의 사육 기록.

   ---------------------------------------------------------------------------
   화면에서 숨기는 것은 잠금이 아닙니다
   ---------------------------------------------------------------------------
   관리자 페이지에서 탭을 감추는 것만으로는 막히지 않습니다. 표는 인터넷에서
   바로 부를 수 있어서, 탭이 안 보여도 요청은 보낼 수 있습니다. 그래서 실제
   차단은 전부 아래 정책(RLS)이 합니다. 화면은 '보여줄 필요 없는 것을 안
   보여주는' 역할만 합니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception E'is_admin() 함수가 없습니다.\nv2 → v3 → v6 → v7 순서로 먼저 실행하세요. 이 파일은 아무것도 바꾸지 않았습니다.';
  end if;
end $guard$;


/* ── 1. 등급 칼럼 ────────────────────────────────────────────────────────
   기본값을 staff 로 둡니다. 앞으로 admins 에 이메일만 넣으면 부관리자가
   되고, 최고관리자는 일부러 지정해야 합니다. 실수로 전권을 주는 쪽보다
   실수로 권한이 모자란 쪽이 낫습니다. */
alter table public.admins add column if not exists role text not null default 'staff';

update public.admins set role = 'owner'
 where lower(email) = 'kmc612000@gmail.com';

/* 기존에 등록돼 있던 다른 관리자가 있다면 staff 로 남습니다.
   전권이 필요하면 아래를 직접 실행하세요.
     update public.admins set role='owner' where email='someone@example.com'; */

do $chk$
begin
  if not exists (select 1 from pg_constraint where conname = 'admins_role_chk') then
    alter table public.admins add constraint admins_role_chk
      check (role in ('owner','staff'));
  end if;
end $chk$;

/* 최고관리자가 하나도 없으면 아무도 관리자 명단을 못 고칩니다.
   그 상태로 스크립트를 끝내면 안 됩니다. */
do $own$
declare n int;
begin
  select count(*) into n from public.admins where role = 'owner';
  if n = 0 then
    raise exception '최고관리자가 한 명도 없습니다. admins 표에서 role 을 owner 로 지정한 뒤 다시 실행하세요.';
  end if;
  raise notice '최고관리자 %명', n;
end $own$;


/* ── 2. 판정 함수 ────────────────────────────────────────────────────────
   is_admin()  기존 그대로 — owner 든 staff 든 참
   is_owner()  최고관리자일 때만 참
   my_admin_role()  화면이 탭을 그릴 때 씁니다 ('owner'|'staff'|null) */
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.admins a
     where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))
       and a.role = 'owner'
  );
$$;

create or replace function public.my_admin_role()
returns text language sql stable security definer set search_path = public as $$
  select a.role from public.admins a
   where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))
   limit 1;
$$;

revoke all on function public.is_owner()      from public;
revoke all on function public.my_admin_role() from public;
grant execute on function public.is_owner()      to authenticated;
grant execute on function public.my_admin_role() to authenticated;


/* ── 3. 관리자 명단 자체 ─────────────────────────────────────────────────
   읽기 — 최고관리자는 전원, 부관리자는 자기 줄만 (자기 등급을 알아야 하므로)
   쓰기 — 최고관리자만. 부관리자가 스스로 owner 로 올릴 수 없습니다. */
drop policy if exists admins_read  on public.admins;
drop policy if exists admins_write on public.admins;
create policy admins_read on public.admins
  for select to authenticated
  using (public.is_owner() or lower(email) = lower(coalesce(auth.jwt()->>'email','')));
create policy admins_write on public.admins
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

/* 마지막 최고관리자를 지우거나 강등하면 아무도 관리자 명단을 못 고칩니다.
   화면에서 막는 것과 별개로 DB 에서도 막습니다. */
create or replace function public.admins_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into n from public.admins where role = 'owner';
    if n <= 1 then
      raise exception '최고관리자는 최소 한 명 남아 있어야 합니다';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists admins_guard_trg on public.admins;
create trigger admins_guard_trg
  before update or delete on public.admins
  for each row execute function public.admins_guard();


/* ── 4. 부관리자도 되는 것 : 코드 발급 + 모프 ────────────────────────────
   is_admin() 이므로 owner·staff 둘 다 통과합니다. v6·v7 에서 이미 이렇게
   깔려 있지만, 어느 표가 어느 등급인지 한자리에서 보이도록 다시 적습니다. */
do $adm$
declare t text;
begin
  foreach t in array array['morphs','combos','cr_genes','cr_genos','cr_traits','cr_combos'] loop
    if to_regclass('public.'||t) is null then
      raise notice '건너뜀 — %표가 없습니다', t;
      continue;
    end if;
    execute format('drop policy if exists %I_read  on public.%I', t, t);
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('create policy %I_admin on public.%I for all to authenticated
                      using (public.is_admin()) with check (public.is_admin())', t, t);
    raise notice '% — 읽기=누구나 · 쓰기=관리자(부관리자 포함)', t;
  end loop;
end $adm$;

drop policy if exists codes_admin on public.access_codes;
create policy codes_admin on public.access_codes
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


/* ── 5. 최고관리자만 되는 것 ─────────────────────────────────────────────
   회원 개인정보·동의 기록·접속 통계·안내 문구·병합 이력.
   부관리자에게 모프 정리를 맡기면서 개인정보까지 넘길 이유는 없습니다. */
do $ownonly$
declare t text;
begin
  foreach t in array array['profiles','consent_archive','unlink_pending',
                           'ui_texts','update_notes','account_merges'] loop
    if to_regclass('public.'||t) is null then
      raise notice '건너뜀 — %표가 없습니다', t;
      continue;
    end if;
    /* 예전 이름들을 모두 걷어냅니다 */
    execute format('drop policy if exists %I_admin       on public.%I', t, t);
    execute format('drop policy if exists %I_admin_read  on public.%I', t, t);
    execute format('drop policy if exists %I_owner       on public.%I', t, t);
    execute format('create policy %I_owner on public.%I for all to authenticated
                      using (public.is_owner()) with check (public.is_owner())', t, t);
    raise notice '% — 최고관리자만', t;
  end loop;
end $ownonly$;

/* v2 가 만든 이름들은 위 규칙과 안 맞아 따로 지웁니다.
   남겨 두면 '부관리자도 읽기 가능' 인 정책이 함께 살아 있게 됩니다. */
drop policy if exists profiles_admin_read on public.profiles;
drop policy if exists ca_admin            on public.consent_archive;
drop policy if exists ul_admin            on public.unlink_pending;
drop policy if exists am_admin            on public.account_merges;

/* 안내 문구는 계산기 화면이 로그인 없이 읽어야 합니다. 읽기는 열어 둡니다. */
do $pub$
declare t text;
begin
  foreach t in array array['ui_texts','update_notes'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
end $pub$;

/* 접속·조합 통계 */
drop policy if exists visits_select_admin on public.visits;
drop policy if exists visits_read         on public.visits;
create policy visits_select_owner on public.visits
  for select to authenticated using (public.is_owner());

drop policy if exists combo_select_admin on public.combo_queries;
drop policy if exists cq_read            on public.combo_queries;
create policy combo_select_owner on public.combo_queries
  for select to authenticated using (public.is_owner());

/* 사육 기록 — 본인 것은 본인이, 남의 것은 최고관리자만.
   v7 은 is_admin() 이었습니다. 부관리자에게까지 열 이유가 없습니다. */
do $rec$
declare t text;
begin
  foreach t in array array['animals','pairings','clutches'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format('create policy %I_own on public.%I for all to authenticated
                      using (user_id = auth.uid() or public.is_owner())
                      with check (user_id = auth.uid() or public.is_owner())', t, t);
  end loop;
end $rec$;

/* 계정 병합도 최고관리자만 */
create or replace function public.merge_account(p_from uuid, p_into uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t text; n int; moved jsonb := '{}'::jsonb; okey text;
begin
  if not public.is_owner() then raise exception '최고관리자만 실행할 수 있습니다'; end if;
  if p_from is null or p_into is null then raise exception '계정 UUID 가 비었습니다'; end if;
  if p_from = p_into then raise exception '같은 계정입니다'; end if;

  okey := 'u_' || p_into::text;

  foreach t in array array['animals','pairings','clutches'] loop
    execute format('update public.%I set user_id = $1, device = $2 where user_id = $3', t)
      using p_into, okey, p_from;
    get diagnostics n = row_count;
    moved := moved || jsonb_build_object(t, n);
  end loop;

  update public.access_codes set redeemed_by = okey
   where redeemed_by = 'u_' || p_from::text;
  get diagnostics n = row_count;
  moved := moved || jsonb_build_object('access_codes', n);

  insert into public.account_merges(from_user, into_user, moved, done_by)
  values (p_from, p_into, moved, coalesce(auth.jwt()->>'email','?'));

  return moved;
end $$;


/* ── 6. 확인 ───────────────────────────────────────────────────────────── */
select '관리자 명단' as 항목, email as 이메일, role as 등급,
       case role when 'owner' then '전부'
                 when 'staff' then '코드 발급 · 모프 수정'
                 else '?' end as 할수있는것,
       coalesce(note,'') as 메모
  from public.admins order by role, email;

select '표별 권한' as 항목, tablename as 표, policyname as 정책,
       case when qual like '%is_owner%'  then '최고관리자만'
            when qual like '%is_admin%'  then '관리자(부관리자 포함)'
            when qual like '%auth.uid%'  then '본인'
            when qual = 'true'           then '누구나'
            else coalesce(qual,'-') end as 누가
  from pg_policies
 where schemaname = 'public'
   and tablename in ('admins','morphs','combos','access_codes',
                     'cr_genes','cr_genos','cr_traits','cr_combos',
                     'profiles','consent_archive','unlink_pending',
                     'ui_texts','update_notes','account_merges',
                     'visits','combo_queries',
                     'animals','pairings','clutches')
 order by tablename, policyname;
