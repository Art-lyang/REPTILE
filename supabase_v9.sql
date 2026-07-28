/* =============================================================================
   supabase_v9.sql — 회원이 어떤 방법으로 가입했는지 보기
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v8.sql 을 먼저 실행하세요. is_owner() 를 씁니다.

   ---------------------------------------------------------------------------
   왜 함수가 필요한가
   ---------------------------------------------------------------------------
   '이메일로 가입했는지 카카오인지 구글인지' 는 auth.identities 에 있습니다.
   이 표는 Supabase 인증 영역이라 브라우저가 직접 읽을 수 없습니다. 그래서
   profiles 를 아무리 뒤져도 나오지 않습니다.

   profiles 에 provider 칼럼을 만들어 가입할 때 적어 두는 방법도 있지만
   쓰지 않았습니다. 나중에 로그인 수단을 추가하거나 해제하면 그 칼럼이
   실제와 어긋나고, 어긋난 줄 아무도 모릅니다. 원본을 그때그때 읽는 편이
   틀릴 여지가 없습니다.

   ---------------------------------------------------------------------------
   한 사람에게 여러 개가 나올 수 있습니다
   ---------------------------------------------------------------------------
   같은 이메일이면 Supabase 가 로그인 수단을 한 계정에 묶습니다. 이메일로
   가입한 뒤 구글로도 로그인했다면 그 회원은 email 과 google 을 둘 다
   가집니다. 그래서 하나가 아니라 목록으로 돌려줍니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regprocedure('public.is_owner()') is null then
    raise exception E'is_owner() 함수가 없습니다.\nsupabase_v8.sql 을 먼저 실행하세요. 이 파일은 아무것도 바꾸지 않았습니다.';
  end if;
end $guard$;


/* ── 1. 가입 수단 조회 (최고관리자 전용) ─────────────────────────────────
   누가 어떤 방법으로 들어오는지는 회원 개인정보에 붙는 정보입니다.
   부관리자에게는 열지 않습니다.

   search_path 에 auth 를 넣습니다. security definer 함수는 search_path 를
   고정해 두지 않으면 호출자가 스키마를 바꿔치기할 수 있습니다. */
drop function if exists public.admin_member_providers();

create or replace function public.admin_member_providers()
returns table(user_id uuid, providers text[], first_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then
    raise exception '최고관리자만 조회할 수 있습니다';
  end if;

  return query
    select i.user_id,
           array_agg(distinct i.provider::text order by i.provider::text),
           min(i.created_at)
      from auth.identities i
     group by i.user_id;
end $$;

revoke all on function public.admin_member_providers() from public;
grant execute on function public.admin_member_providers() to authenticated;


/* ── 2. 확인 ─────────────────────────────────────────────────────────────
   SQL Editor 는 관리자 권한이라 is_owner() 가 거짓일 수 있습니다.
   그때는 아래가 오류를 냅니다. 정상입니다 — 화면에서 확인하세요.

   원본을 바로 보려면 이쪽을 쓰세요. */
select p.email as 이메일,
       coalesce(
         (select string_agg(distinct i.provider::text, ', ' order by i.provider::text)
            from auth.identities i where i.user_id = p.user_id),
         '(없음)') as 가입수단,
       p.created_at::date as 가입일
  from public.profiles p
 order by p.created_at desc
 limit 50;
