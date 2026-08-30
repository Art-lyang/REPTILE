/* =============================================================================
   supabase_v15.sql — 비밀번호 재설정 (운영자가 임시 비밀번호를 직접 발급)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v14.sql 이 먼저 적용돼 있어야 합니다.

   ---------------------------------------------------------------------------
   흐름
   ---------------------------------------------------------------------------
     1. 회원이 로그인 화면에서 '비밀번호를 잊으셨나요?' → 이메일 입력
     2. 요청이 password_resets 에 쌓입니다 (메일은 나가지 않습니다)
     3. 운영자가 관리자 → 회원 탭에서 임시 비밀번호를 발급
     4. 운영자가 그 비밀번호를 회원 이메일로 직접 보냅니다
     5. 회원이 임시 비밀번호로 로그인하면 즉시 새 비밀번호 설정 화면이 뜹니다

   ---------------------------------------------------------------------------
   원래 비밀번호는 아무도 볼 수 없습니다
   ---------------------------------------------------------------------------
   auth.users 에는 비밀번호가 단방향 해시(bcrypt)로만 들어 있습니다. 운영자도,
   이 SQL 도 원문을 읽을 수 없습니다. '알려주기' 가 아니라 '덮어쓰기' 만
   가능하며, 아래 함수도 덮어쓰기만 합니다.

   ---------------------------------------------------------------------------
   ⚠️ auth 스키마를 직접 건드립니다
   ---------------------------------------------------------------------------
   Supabase 가 공식적으로 권장하는 방법은 service_role 키로 Admin API 를
   부르는 것입니다. 하지만 그 키는 브라우저에 두면 안 되고(모든 권한을 가진
   마스터 키입니다), 관리자 페이지는 브라우저에서 도는 정적 화면입니다.

   그래서 auth.users 의 비밀번호 칸만 직접 갱신합니다. GoTrue 가 쓰는 것과
   같은 bcrypt 형식으로 씁니다. Supabase 가 인증 내부 구조를 바꾸면 이 함수는
   손봐야 합니다. 로그인이 안 되기 시작하면 여기를 먼저 의심하세요.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regprocedure('public.is_owner()') is null then
    raise exception E'is_owner() 가 없습니다.\nsupabase_v8.sql 을 먼저 실행하세요.';
  end if;
  if to_regprocedure('extensions.crypt(text,text)') is null
     and to_regprocedure('public.crypt(text,text)') is null then
    raise exception E'pgcrypto 가 없습니다.\nDatabase → Extensions 에서 pgcrypto 를 켠 뒤 다시 실행하세요.';
  end if;
end $guard$;


/* ── 1. 재설정 요청 표 ───────────────────────────────────────────────────
   이메일만 남깁니다. 요청 자체는 로그인하지 않은 사람이 넣는 것이라,
   실제로 그 계정 주인인지는 이 시점에 알 수 없습니다. 확인은 운영자가
   메일을 보내는 단계에서 이루어집니다 — 그 주소로 보내니까요. */
create table if not exists public.password_resets (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  status     text not null default 'open',   -- open | done | ignored
  note       text,                           -- 회원이 남긴 메모
  ip_country text,                           -- 어느 나라에서 요청했는지 (참고용)
  handled_by text,                           -- 처리한 관리자 이메일
  handled_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists password_resets_idx on public.password_resets (status, created_at desc);

alter table public.password_resets enable row level security;
drop policy if exists pr_owner  on public.password_resets;
drop policy if exists pr_insert on public.password_resets;
/* 조회·수정은 최고관리자만. 요청 넣기는 아래 함수로만 (표에 직접 넣지 못합니다). */
create policy pr_owner on public.password_resets
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());


/* ── 2. 회원이 재설정을 요청 ─────────────────────────────────────────────
   가입하지 않은 이메일을 넣어도 똑같이 성공한 것처럼 응답합니다.
   "그 계정 없습니다" 라고 알려주면 남의 가입 여부를 확인하는 수단이 됩니다.

   같은 주소로 하루 5번까지만 받습니다. 그 이상은 조용히 무시합니다 —
   막혔다고 알려주면 그것도 정보가 됩니다. */
create or replace function public.request_password_reset(p_email text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(coalesce(p_email,''))); n int;
begin
  if em = '' or em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;

  select count(*) into n from public.password_resets
   where email = em and created_at > now() - interval '1 day';
  if n >= 5 then
    return jsonb_build_object('ok', true);   -- 티 내지 않습니다
  end if;

  insert into public.password_resets (email, note)
  values (em, nullif(trim(coalesce(p_note,'')),''));

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.request_password_reset(text,text) from public;
revoke execute on function public.request_password_reset(text,text) from anon, authenticated;


/* ── 3. 관리자: 요청 목록 ───────────────────────────────────────────────
   가입된 계정인지 함께 보여줍니다. 없는 주소로 온 요청은 대응할 것이
   없으므로 바로 무시 처리하시면 됩니다. */
create or replace function public.admin_list_resets(p_status text default 'open')
returns table(id uuid, email text, status text, note text,
              has_account boolean, created_at timestamptz,
              handled_by text, handled_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then raise exception '최고관리자만 조회할 수 있습니다'; end if;
  return query
    select r.id, r.email, r.status, r.note,
           exists(select 1 from auth.users u where lower(u.email) = r.email),
           r.created_at, r.handled_by, r.handled_at
      from public.password_resets r
     where p_status is null or p_status = 'all' or r.status = p_status
     order by r.created_at desc
     limit 200;
end $$;

revoke all on function public.admin_list_resets(text) from public;
grant execute on function public.admin_list_resets(text) to authenticated;


/* ── 4. 관리자: 임시 비밀번호 발급 ───────────────────────────────────────
   원래 비밀번호를 덮어씁니다. 되돌릴 수 없습니다.

   함께 하는 일
     · profiles.must_change_password = true  → 로그인하면 변경 화면이 뜹니다
     · 기존 로그인 세션 전부 해제 → 남이 이미 들어와 있었다면 그것도 끊깁니다
     · 해당 이메일의 열린 요청을 처리 완료로 표시

   반환값에 비밀번호가 그대로 담깁니다. 화면에 한 번 보여주고 운영자가
   회원에게 전달하는 용도입니다. DB 에 원문을 남기지는 않습니다. */
create or replace function public.admin_set_temp_password(p_email text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare em text := lower(trim(coalesce(p_email,'')));
        uid uuid;
        me  text := coalesce(auth.jwt()->>'email','?');
begin
  if not public.is_owner() then raise exception '최고관리자만 실행할 수 있습니다'; end if;
  if length(coalesce(p_password,'')) < 8 then
    raise exception '임시 비밀번호는 8자 이상이어야 합니다';
  end if;
  if p_password !~ '[^A-Za-z0-9]' then
    raise exception '임시 비밀번호에 특수문자를 하나 이상 넣어 주세요';
  end if;

  select id into uid from auth.users where lower(email) = em;
  if uid is null then
    raise exception '그 이메일로 가입한 계정이 없습니다';
  end if;

  /* GoTrue 와 같은 bcrypt 형식으로 덮어씁니다. */
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = uid;

  /* 쓰던 세션을 모두 끊습니다. 계정을 빼앗긴 경우라면 이게 핵심입니다 —
     비밀번호만 바꾸고 세션을 두면 침입자는 그대로 들어와 있습니다. */
  begin
    delete from auth.refresh_tokens where user_id = uid::text;
  exception when others then null;
  end;
  begin
    delete from auth.sessions where user_id = uid;
  exception when others then null;
  end;

  update public.profiles
     set must_change_password = true, updated_at = now()
   where user_id = uid;

  update public.password_resets
     set status = 'done', handled_by = me, handled_at = now()
   where email = em and status = 'open';

  return jsonb_build_object('ok', true, 'email', em, 'password', p_password);
end $$;

revoke all on function public.admin_set_temp_password(text,text) from public;
grant execute on function public.admin_set_temp_password(text,text) to authenticated;


/* ── 5. 관리자: 요청 무시 처리 ─────────────────────────────────────────── */
create or replace function public.admin_close_reset(p_id uuid, p_status text default 'ignored')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception '최고관리자만 실행할 수 있습니다'; end if;
  update public.password_resets
     set status = coalesce(p_status,'ignored'),
         handled_by = coalesce(auth.jwt()->>'email','?'), handled_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_close_reset(uuid,text) from public;
grant execute on function public.admin_close_reset(uuid,text) to authenticated;


/* ── 6. 회원이 새 비밀번호로 바꾼 뒤 표시 해제 ───────────────────────────
   비밀번호 변경 자체는 화면에서 supabase-js 의 updateUser 로 합니다.
   그 다음 이 함수를 불러 '변경해야 함' 표시를 내립니다. */
alter table public.profiles add column if not exists must_change_password boolean default false;

create or replace function public.clear_must_change()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform set_config('app.consent_write', '1', true);   -- profiles_guard 통과용
  update public.profiles
     set must_change_password = false, updated_at = now()
   where user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.clear_must_change() from public;
grant execute on function public.clear_must_change() to authenticated;

/* profiles_guard 가 must_change_password 를 막지 않도록 예외에 넣습니다.
   (v14 의 트리거는 동의 칼럼만 막습니다. 이 칼럼은 목록에 없어 통과합니다) */


/* ── 7. 확인 ─────────────────────────────────────────────────────────── */
select '재설정 요청' as 항목, status as 상태, count(*) as 건수
  from public.password_resets group by status;

select routine_name as 함수
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('request_password_reset','admin_list_resets',
                        'admin_set_temp_password','admin_close_reset','clear_must_change')
 order by 1;
