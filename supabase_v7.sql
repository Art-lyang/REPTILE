/* =============================================================================
   supabase_v7.sql — 사육 기록을 '계정' 것으로 바꾸기
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v6.sql 을 먼저 실행하세요. 이 파일은 v6 이 깐 정책을
     '관리자만' 에서 '본인 또는 관리자' 로 바꿉니다.

   ---------------------------------------------------------------------------
   무엇이 문제였나 — 실제로 확인한 것
   ---------------------------------------------------------------------------
   기록의 주인이 device 라는 문자열이고, 그 문자열을 서버가 정하는 게 아니라
   브라우저가 함수에 넣어 보냅니다.

       my_rows(p_device => '아무거나', p_table => 'animals')

   이 함수는 security definer 라 RLS 를 통과합니다. 그래서 로그인하지 않은
   상태로 아무 키나 넣어 부르면 그 키의 기록이 그대로 나옵니다. 실제로
   호출해 보고 HTTP 200 이 오는 것을 확인했습니다.

   로그인한 사람의 기록도 안전하지 않습니다. 로그인하면 claim_device 가
   기록의 주인을 'u_' + 계정UUID 로 바꿔 두는데, 이것도 결국 문자열이라
   같은 방법으로 읽힙니다. 게다가 claim_device 는 주인을 '바꾸는' 함수라

       claim_device(p_device => 'u_남의계정', p_user => 'u_내계정')

   이렇게 부르면 남의 기록이 통째로 내 것이 됩니다. 읽히는 것보다 이쪽이
   더 심각합니다. delete_row 도 같은 방식으로 남의 기록을 지울 수 있습니다.

   계정UUID 는 비밀번호가 아닙니다. 감춰져 있을 뿐이지 새어 나갈 수 있는
   값이고, 새는 순간 그 계정의 기록 전체가 열립니다.

   ---------------------------------------------------------------------------
   어떻게 고치나
   ---------------------------------------------------------------------------
   주인을 브라우저가 말하게 두지 않고, 서버가 로그인 토큰에서 직접 꺼냅니다.
   auth.uid() 는 Supabase 가 검증한 값이라 위조할 수 없습니다.

       로그인함    → auth.uid() 가 주인. p_device 로 뭘 보내든 무시합니다.
       로그인 안함 → 예전처럼 device 로. 단 계정 소유 기록에는 손댈 수 없고,
                     'u_' 로 시작하는 키는 아예 거부합니다.

   함수 이름과 인자는 그대로 둡니다. 그래서 이 SQL 만 실행하면 지금 배포된
   화면 그대로 바로 막힙니다. 사이트를 다시 배포할 필요가 없습니다.

   ---------------------------------------------------------------------------
   계정 합치기
   ---------------------------------------------------------------------------
   같은 이메일이면 Supabase 가 로그인 수단을 자동으로 한 계정에 묶습니다.
   이때 계정UUID 는 그대로라 기록도 그대로 따라옵니다.

   문제는 '이미 갈라진' 경우입니다. 이메일 가입과 소셜 가입이 따로 계정을
   만들어 버린 뒤에는 자동으로 합쳐지지 않습니다. 그건 사람이 확인하고
   합쳐야 해서, 아래에 merge_account() 와 이력표를 만들어 둡니다.
   자동 실행되지 않습니다. 관리자가 직접 부를 때만 움직입니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception E'is_admin() 함수가 없습니다.\nsupabase_v2 → v3 → v6 순서로 먼저 실행하세요. 이 파일은 아무것도 바꾸지 않았습니다.';
  end if;
end $guard$;


/* ── 1. 관리자 확인 ──────────────────────────────────────────────────── */
insert into public.admins(email) values ('kmc612000@gmail.com')
  on conflict (email) do nothing;
update public.admins set note = coalesce(note, 'owner')
 where lower(email) = 'kmc612000@gmail.com';

select '관리자 명단' as 항목, email as 이메일, coalesce(note,'') as 메모
  from public.admins order by created_at;


/* ── 2. 계정 칼럼 추가 ───────────────────────────────────────────────────
   device 는 그대로 둡니다. 로그인 안 한 사람은 계속 device 로 씁니다.
   user_id 가 채워진 행 = 계정 소유, 비어 있는 행 = 기기 소유.

   auth.users 로 외래키를 걸지 않았습니다. 예전 기록 중에 이미 탈퇴한
   계정을 가리키는 게 있으면 제약 추가가 실패하면서 이 스크립트 전체가
   취소되기 때문입니다. 보안은 아래 정책과 함수가 담당하므로 외래키가
   없어도 문제되지 않습니다. */
do $cols$
declare t text; n int;
begin
  foreach t in array array['animals','pairings','clutches'] loop
    execute format('alter table public.%I add column if not exists user_id uuid', t);
    execute format('create index if not exists %I on public.%I(user_id)', t||'_user_id_idx', t);

    /* 기존 기록 옮기기 — device 가 'u_계정UUID' 형태인 것만 계정 소유로 */
    execute format($f$
      update public.%I
         set user_id = substring(device from 3)::uuid
       where user_id is null
         and device like 'u\_%%'
         and substring(device from 3) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    $f$, t);
    get diagnostics n = row_count;
    raise notice '% — 계정 소유로 옮긴 기록 %건', t, n;
  end loop;
end $cols$;


/* ── 2-2. 기존 함수 먼저 지우기 ──────────────────────────────────────────
   create or replace 는 인자 이름·기본값까지 같아야 통과합니다. 지금 DB 에
   깔린 함수 중에 인자에 기본값이 붙은 게 있어서 아래 오류가 났습니다.

     42P13: cannot remove parameter defaults from existing function
     HINT:  Use DROP FUNCTION redeem_code(text,text) first.

   그래서 바꿀 함수를 먼저 지우고 새로 만듭니다. 지우면 권한(grant)도 같이
   날아가므로 아래 9-2 에서 다시 부여합니다. 화면은 인자를 항상 전부
   넘기고 있어(확인함) 기본값이 없어져도 그대로 동작합니다.

   함수만 지웁니다. 표와 데이터는 건드리지 않습니다.

   이름만 보고 지웁니다. 인자를 하나하나 적어서 지우면, 지금 DB 에 깔린
   모양이 제가 아는 것과 조금이라도 다를 때 그건 안 지워진 채 새 함수가
   덧붙어 이름이 같은 함수 두 개가 남습니다. 그러면 어느 쪽이 불릴지
   알 수 없게 됩니다. */
do $drop$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname in ('my_rows','save_row','delete_row','claim_device',
                         'redeem_code','is_premium','premium_status',
                         'delete_my_account','merge_account')
  loop
    raise notice '지움 — %', r.sig;
    execute 'drop function ' || r.sig::text;
    n := n + 1;
  end loop;
  raise notice '함수 %개 정리', n;
end $drop$;


/* ── 3. 기록 조회 : 주인을 서버가 정합니다 ───────────────────────────── */
create or replace function public.my_rows(p_device text, p_table text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j jsonb; u uuid := auth.uid();
begin
  if p_table not in ('animals','pairings','clutches') then
    raise exception 'bad table';
  end if;

  if u is not null then
    /* 로그인함 — p_device 는 쳐다보지 않습니다 */
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), ''[]''::jsonb)
                      from public.%I t where t.user_id = $1', p_table)
      into j using u;
  else
    /* 로그인 안 함 — 기기 것만. 계정 키를 흉내 내면 거부합니다 */
    if coalesce(p_device,'') = '' or p_device like 'u\_%' then
      return '[]'::jsonb;
    end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), ''[]''::jsonb)
                      from public.%I t where t.user_id is null and t.device = $1', p_table)
      into j using p_device;
  end if;
  return j;
end $$;


/* ── 4. 기록 저장 ────────────────────────────────────────────────────────
   보내온 값에서 device·user_id 를 먼저 떼어 냅니다. 안 그러면 저장하면서
   주인을 남으로 바꿔치기할 수 있습니다. */
create or replace function public.save_row(p_device text, p_table text, p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare newid uuid; u uuid := auth.uid(); okey text;
begin
  if p_table not in ('animals','pairings','clutches') then
    raise exception 'bad table';
  end if;

  p_row := p_row - 'device' - 'user_id';

  if u is not null then
    okey := 'u_' || u::text;
    p_row := p_row || jsonb_build_object('user_id', u::text, 'device', okey);
  else
    if coalesce(p_device,'') = '' or p_device like 'u\_%' then
      raise exception '로그인이 필요합니다';
    end if;
    p_row := p_row || jsonb_build_object('device', p_device);
  end if;

  if coalesce(p_row->>'id','') = '' then
    p_row := p_row || jsonb_build_object('id', gen_random_uuid()::text);
  else
    /* 고치기 = 내 것만 지우고 다시 넣기.
       남의 id 를 넣으면 아래 delete 가 0건이 되고, insert 에서 기본키가
       겹쳐 오류가 납니다. 즉 남의 기록을 덮어쓸 수 없습니다. */
    if u is not null then
      execute format('delete from public.%I where id = $1 and user_id = $2', p_table)
        using (p_row->>'id')::uuid, u;
    else
      execute format('delete from public.%I where id = $1 and device = $2 and user_id is null', p_table)
        using (p_row->>'id')::uuid, p_device;
    end if;
  end if;

  if coalesce(p_row->>'created_at','') = '' then
    p_row := p_row || jsonb_build_object('created_at', now());
  end if;

  begin
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) returning id',
                   p_table, p_table)
      into newid using p_row;
  exception when unique_violation then
    raise exception '내 기록이 아닙니다';
  end;
  return newid;
end $$;


/* ── 5. 기록 삭제 ────────────────────────────────────────────────────── */
create or replace function public.delete_row(p_device text, p_table text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); n int;
begin
  if p_table not in ('animals','pairings','clutches') then
    raise exception 'bad table';
  end if;

  if u is not null then
    execute format('delete from public.%I where id = $1 and user_id = $2', p_table) using p_id, u;
  else
    if coalesce(p_device,'') = '' or p_device like 'u\_%' then return false; end if;
    execute format('delete from public.%I where id = $1 and device = $2 and user_id is null', p_table)
      using p_id, p_device;
  end if;

  get diagnostics n = row_count;
  return n > 0;
end $$;


/* ── 6. 기기 → 계정 이관 ─────────────────────────────────────────────────
   남의 것을 가져오는 데 쓰이던 함수입니다. 이제 세 가지를 강제합니다.
     · 로그인해야 함
     · 받는 쪽은 항상 나 (p_user 는 무시)
     · 주는 쪽은 임자 없는 기기 기록만 ('u_' 로 시작하면 거부) */
create or replace function public.claim_device(p_device text, p_user text)
returns boolean language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); okey text; t text; n int; tot int := 0;
begin
  if u is null then return false; end if;
  if coalesce(p_device,'') = '' or p_device like 'u\_%' then return false; end if;

  okey := 'u_' || u::text;

  update public.access_codes
     set redeemed_by = okey
   where redeemed_by = p_device;

  foreach t in array array['animals','pairings','clutches'] loop
    execute format('update public.%I set user_id = $1, device = $2 where device = $3 and user_id is null', t)
      using u, okey, p_device;
    get diagnostics n = row_count;
    tot := tot + n;
  end loop;

  raise notice '계정으로 옮긴 기록 %건', tot;
  return true;
end $$;


/* ── 7. 코드 사용 ────────────────────────────────────────────────────────
   화면에서는 로그인해야 코드를 넣을 수 있지만, 함수 자체에는 확인이
   없었습니다. 함수는 인터넷에서 바로 부를 수 있으므로 화면의 제한은
   제한이 아닙니다. 로그인 없이 기기 키로 프리미엄을 켜거나, 남의 계정
   키를 적어 코드를 그쪽에 붙여 버릴 수 있었습니다.

   이제 로그인해야 하고, 받는 쪽은 항상 부른 사람 본인입니다.
   'login_required' 는 화면이 이미 처리하고 있는 응답이라 그대로 씁니다. */
create or replace function public.redeem_code(p_code text, p_device text)
returns text language plpgsql security definer set search_path = public as $$
declare r public.access_codes; u uuid := auth.uid(); okey text;
begin
  if u is null then return 'login_required'; end if;
  okey := 'u_' || u::text;

  select * into r from public.access_codes where code = p_code for update;
  if not found then return 'not_found'; end if;
  if r.revoked then return 'revoked';   end if;
  if r.redeemed_by is not null and r.redeemed_by <> okey then return 'used'; end if;

  update public.access_codes
     set redeemed_by = okey,
         redeemed_at = coalesce(redeemed_at, now()),
         expires_at  = coalesce(expires_at,
                        case when days is null then null else now() + (days || ' days')::interval end)
   where code = p_code;
  return 'ok';
end $$;


/* ── 7-2. 프리미엄 조회 ──────────────────────────────────────────────────
   기록만큼 민감하진 않지만, 같은 이유로 남의 키를 넣어 볼 수 있었습니다.
   로그인했으면 내 것만 보게 합니다. */
create or replace function public.is_premium(p_device text)
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.access_codes
     where redeemed_by = case when auth.uid() is not null
                              then 'u_' || auth.uid()::text
                              else p_device end
       and revoked = false
       and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.premium_status(p_device text)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('active', true, 'kind', kind, 'expires_at', expires_at)
       from public.access_codes
      where redeemed_by = case when auth.uid() is not null
                               then 'u_' || auth.uid()::text
                               else p_device end
        and revoked = false
        and (expires_at is null or expires_at > now())
      order by (kind='sub') desc, expires_at desc nulls first
      limit 1),
    jsonb_build_object('active', false, 'kind', null, 'expires_at', null));
$$;


/* ── 7-3. 탈퇴 시 삭제 기준 맞추기 ───────────────────────────────────────
   delete_my_account() 는 기록을 device = 'u_계정UUID' 로 찾아 지웁니다.
   이제 주인이 user_id 이므로, 그 기준으로도 지우지 않으면 탈퇴한 사람의
   사육 기록이 DB 에 남습니다. 개인정보가 남는 것이라 그냥 둘 수 없습니다.

   나머지 동작(동의 기록 5년 보존, 코드 무효화, 프로필·계정 삭제)은
   그대로입니다. 지우는 조건에 user_id 를 더한 것뿐입니다. */
create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        dev text;
        p   public.profiles;
begin
  if uid is null then raise exception 'not signed in'; end if;
  dev := 'u_' || uid::text;

  -- 1) 동의 기록을 익명화해 보존 (법정 5년)
  select * into p from public.profiles where user_id = uid;
  if found then
    insert into public.consent_archive
      (user_ref, agree_terms, agree_privacy, agree_age14, agree_third,
       agree_mkt_email, agree_mkt_sms, consent_at, purge_after)
    values
      (md5(uid::text || '|reptile-withdrawn'),
       p.agree_terms, p.agree_privacy, p.agree_age14, p.agree_third,
       p.agree_mkt_email, p.agree_mkt_sms, p.consent_at,
       (now() + interval '5 years')::date);
  end if;

  -- 2) 사용자 데이터 삭제 — 계정 기준과 예전 기기 키 기준 둘 다
  delete from public.clutches where user_id = uid or device = dev;
  delete from public.pairings where user_id = uid or device = dev;
  delete from public.animals  where user_id = uid or device = dev;

  -- 3) 프리미엄 코드 연결 해제 (코드 자체는 재사용 불가로 남김)
  update public.access_codes set revoked = true where redeemed_by = dev;

  -- 4) 프로필(신원정보) 삭제
  delete from public.profiles where user_id = uid;

  -- 5) 인증 계정 삭제
  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true);
end $$;


/* ── 8. 정책 : '관리자만' → '본인 또는 관리자' ───────────────────────────
   v6 은 급한 대로 표를 관리자에게만 열어 두었습니다. 이제 주인이 계정이니
   본인도 자기 것을 직접 볼 수 있습니다. 함수를 거치지 않고 표를 직접
   읽더라도 남의 것은 안 나옵니다. */
do $pol$
declare t text;
begin
  foreach t in array array['animals','pairings','clutches'] loop
    execute format('drop policy if exists %I_own   on public.%I', t, t);
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format(
      'create policy %I_own on public.%I for all to authenticated
         using (user_id = auth.uid() or public.is_admin())
         with check (user_id = auth.uid() or public.is_admin())', t, t);
    raise notice '% — 본인 또는 관리자', t;
  end loop;
end $pol$;


/* ── 9. 갈라진 계정 합치기 ───────────────────────────────────────────────
   자동으로 돌지 않습니다. 관리자가 본인 확인을 마친 뒤 직접 부릅니다.

     select public.merge_account('보내는계정UUID', '받는계정UUID');

   보내는 계정의 기록·코드가 받는 계정으로 넘어가고, 이력이 남습니다.
   되돌릴 일이 생길 수 있으니 언제 무엇을 옮겼는지 반드시 기록합니다.

   이것만으로 병합이 끝나지 않습니다. 아래는 일부러 손대지 않았습니다.

     프로필(이름·닉네임·전화)  어느 값을 살릴지 사람이 정해야 합니다
     동의 기록                 잘못 합치면 동의 안 한 사람에게 광고가 갑니다
     로그인 수단(identity)     auth.identities 를 직접 고치는 일이라 별도 검토
     빈 계정 삭제              되돌릴 수 없으므로 확인 후 수동으로

   그리고 병합 전에 양쪽 계정 모두 본인 것이 맞는지 확인해야 합니다.
   한쪽만 확인하고 합치면 그게 곧 계정 탈취입니다. docs/AUTH.md 6.5 참고. */
create table if not exists public.account_merges (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null,
  into_user  uuid not null,
  moved      jsonb,                    -- 표별로 몇 건 옮겼는지
  done_by    text,                     -- 실행한 관리자 이메일
  created_at timestamptz default now()
);
alter table public.account_merges enable row level security;
drop policy if exists am_admin on public.account_merges;
create policy am_admin on public.account_merges
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.merge_account(p_from uuid, p_into uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t text; n int; moved jsonb := '{}'::jsonb; okey text;
begin
  if not public.is_admin() then raise exception '관리자만 실행할 수 있습니다'; end if;
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


/* ── 9-2. 권한 다시 부여 ─────────────────────────────────────────────────
   2-2 에서 함수를 지웠으므로 grant 도 같이 날아갔습니다. 다시 답니다.

   앞의 일곱 개에 anon 이 남아 있는 것은 의도한 것입니다. 계산기는 회원가입
   없이 쓰는 서비스라, 로그인 안 한 사람도 자기 기기 기록은 다뤄야 합니다.
   '누가 주인인가' 는 이제 함수 안에서 auth.uid() 로 가리므로, 호출 권한이
   열려 있어도 남의 것에는 닿지 않습니다.

   반대로 아래 두 개는 PUBLIC 까지 회수합니다. 새로 만든 함수는 기본적으로
   PUBLIC 에 실행 권한이 붙기 때문에, anon 만 회수하면 PUBLIC 경로로 그대로
   불립니다. */
grant execute on function public.my_rows(text, text)         to anon, authenticated;
grant execute on function public.save_row(text, text, jsonb) to anon, authenticated;
grant execute on function public.delete_row(text, text, uuid) to anon, authenticated;
grant execute on function public.claim_device(text, text)    to anon, authenticated;
grant execute on function public.redeem_code(text, text)     to anon, authenticated;
grant execute on function public.is_premium(text)            to anon, authenticated;
grant execute on function public.premium_status(text)        to anon, authenticated;

revoke all on function public.delete_my_account()          from public;
revoke all on function public.merge_account(uuid, uuid)    from public;
grant execute on function public.delete_my_account()         to authenticated;
grant execute on function public.merge_account(uuid, uuid)   to authenticated;


/* ── 10. 확인 ──────────────────────────────────────────────────────────── */
select '기록 주인 현황' as 항목, 'animals' as 표,
       count(*) filter (where user_id is not null) as 계정소유,
       count(*) filter (where user_id is null)     as 기기소유
  from public.animals
union all
select '기록 주인 현황', 'pairings',
       count(*) filter (where user_id is not null),
       count(*) filter (where user_id is null)
  from public.pairings
union all
select '기록 주인 현황', 'clutches',
       count(*) filter (where user_id is not null),
       count(*) filter (where user_id is null)
  from public.clutches;

select '정책 확인' as 항목, tablename as 표, policyname as 정책, qual as 조건
  from pg_policies
 where schemaname = 'public'
   and tablename in ('animals','pairings','clutches')
 order by tablename;

/* 로그인 안 한 상태에서 아래를 부르면 이제 빈 배열만 나와야 합니다.
   (SQL Editor 는 관리자 권한이라 여기서는 의미가 없습니다.
    확인은 브라우저 로그아웃 상태에서 하세요.)
     select public.my_rows('u_아무거나','animals');            → []
     select public.claim_device('u_남의계정','u_내계정');       → false          */
