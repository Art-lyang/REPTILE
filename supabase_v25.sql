/* =============================================================================
   supabase_v25.sql — 개체 사진을 비공개 버킷으로 (서명 주소)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ⚠️ 이 SQL 만 돌리고 배포를 안 하면 사진이 안 보입니다. 반대로 배포만 하고
      이 SQL 을 안 돌려도 안 보입니다. 둘 다 해야 합니다.

   ---------------------------------------------------------------------------
   무엇이 문제였나
   ---------------------------------------------------------------------------
   개체 사진이 morph-images 버킷에 있고 이 버킷은 public 입니다. 그래서
   주소를 한 번 받아 간 사람은 그 뒤로 무슨 짓을 해도 계속 볼 수 있습니다.

     · 공개 프로필을 꺼도 — 사진 주소는 그대로 열립니다
     · 주소를 새로 만들어도 — 이미지 주소는 안 바뀝니다
     · 사진을 지워도 — photo_url 만 지워질 뿐 파일은 남습니다

   약관 제6조의3 ⑤ 에 "사진 주소는 회수되지 않습니다" 라고 적어 둔 것이
   이것입니다. 사실이라 적었을 뿐, 이게 맞는 상태는 아닙니다.

   ---------------------------------------------------------------------------
   왜 버킷을 나누나 — morph-images 를 비공개로 돌리면 안 되는 이유
   ---------------------------------------------------------------------------
   같은 버킷에 두 종류가 섞여 있습니다.

     m/  관리자가 올리는 모프 대표 이미지
         → 계산기 4개(레오파드·크레스티드·팻테일·볼파이톤)에서
           로그인하지 않은 방문자에게 그대로 보여줍니다. 사이트 자산입니다.
     a/  회원이 올리는 개체 사진
         → 개인 사진입니다. 회원이 공개를 켜야만 남에게 보여야 합니다.

   버킷을 통째로 비공개로 돌리면 m/ 도 같이 잠깁니다. 그러면 계산기가
   페이지를 열 때마다 이미지마다 서명을 받아야 해서, 공개 페이지에
   불필요한 왕복과 실패 지점이 생깁니다. 성격이 다른 둘을 한 버킷에 둔 것이
   원래 문제였으므로 여기서 나눕니다.

     morph-images   (공개 유지)  — m/ 관리자 모프 이미지
     animal-photos  (비공개 신규) — 회원 개체 사진

   ---------------------------------------------------------------------------
   비공개인데 남이 어떻게 보나 — 서명 주소
   ---------------------------------------------------------------------------
   <img src> 에는 헤더를 붙일 수 없어서, 비공개 파일은 주소 안에 토큰이
   들어간 '서명 주소' 로만 보여줄 수 있습니다. 서명은 그 파일을 읽을 권한이
   있는 쪽만 만들 수 있고, 만들어진 주소는 정해진 시간이 지나면 죽습니다.

   그래서 아래 읽기 정책이 핵심입니다. 익명 방문자라도 '지금 공개된 개체에
   붙어 있는 사진' 이면 읽을 수 있게 해 둡니다. 회원이 공개를 끄면 그 순간
   조건이 거짓이 되어 새 서명을 못 받습니다 — 이미 발급된 서명만 남은
   유효시간 동안(1시간) 살아 있다가 죽습니다. 이게 '회수' 입니다.

   ---------------------------------------------------------------------------
   ⚠️ 이미 올려 둔 개체 사진은 따라오지 않습니다
   ---------------------------------------------------------------------------
   버킷 사이의 파일 이동은 SQL 로 못 합니다. storage.objects 의 bucket_id 만
   바꾸면 행과 실제 파일이 어긋나서 더 나쁩니다.

   지금은 가입을 막아둔 상태라 테스트 개체뿐입니다. 아래 3번 확인 구문이
   남아 있는 개수를 알려주니, 있으면 해당 개체에서 사진을 다시 올려주세요.
   옛 파일은 공개 버킷에 남아 있으므로, 다 옮긴 뒤 4번 구문으로 지우세요.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception E'animals 표가 없습니다.\nsupabase_setup.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. 비공개 버킷 만들기 ───────────────────────────────────────────────
   public=false 가 핵심입니다. 이미 있으면 비공개로 되돌립니다 —
   실수로 공개로 바꿔 두었을 수 있습니다. */
do $bucket$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('animal-photos', 'animal-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do update
      set public = false,
          file_size_limit = 5242880,
          allowed_mime_types = array['image/jpeg','image/png','image/webp'];
exception when others then
  raise notice '[건너뜀] 버킷 생성 실패: % — Storage 화면에서 직접 만드세요 (Public 끄기).', sqlerrm;
end $bucket$;


/* ── 2. animal-photos 정책 ───────────────────────────────────────────────
   경로 규칙은 morph-images 때와 같습니다.
       a/u_<사용자 uuid>_<시각>_<무작위>.jpg
   care/care-app.js 이 이 모양으로 올립니다. 규칙이 바뀌면 여기도 고치세요. */
do $policy$
begin
  drop policy if exists ap_read   on storage.objects;
  drop policy if exists ap_insert on storage.objects;
  drop policy if exists ap_update on storage.objects;
  drop policy if exists ap_delete on storage.objects;

  /* 읽기 — 둘 중 하나면 됩니다.
       ① 내 사진이다
       ② 지금 공개된 개체에 붙어 있다

     ② 를 photo_url/photos 문자열로 대조하는 것은, 그래야 이미 저장된
     데이터를 건드리지 않기 때문입니다. 두 칼럼에는 전체 주소가 들어 있고
     그 끝이 곧 파일 경로입니다. 경로만 따로 저장하도록 바꾸면 더 깔끔하지만,
     그건 기존 행을 전부 고쳐야 하는 일이라 지금은 하지 않습니다.

     ⚠️ is_public 이 꺼지면 이 조건이 거짓이 됩니다. 그때부터 새 서명을
        못 받습니다. 이미 나간 서명은 유효시간까지만 삽니다. */
  create policy ap_read on storage.objects for select to anon, authenticated
    using (
      bucket_id = 'animal-photos'
      and (
        name like 'a/u\_' || coalesce(auth.uid()::text, '-') || '\_%'
        or exists (
          select 1 from public.animals a
           where a.is_public = true
             and ( a.photo_url like '%/' || storage.objects.name
                   or exists (select 1 from unnest(coalesce(a.photos, '{}')) p
                               where p like '%/' || storage.objects.name) )
        )
      )
    );

  /* 올리기 — 자기 경로에만. 남의 uuid 로 올릴 수 없습니다. */
  create policy ap_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'animal-photos'
      and name like 'a/u\_' || auth.uid()::text || '\_%'
    );

  /* 덮어쓰기 · 지우기 — 자기 파일만.
     morph-images 는 지우기가 관리자 전용이라, 회원이 '사진 지우기' 를 눌러도
     photo_url 만 비워지고 파일은 남았습니다. 여기서는 실제로 지워집니다. */
  create policy ap_update on storage.objects for update to authenticated
    using      (bucket_id = 'animal-photos' and name like 'a/u\_' || auth.uid()::text || '\_%')
    with check (bucket_id = 'animal-photos' and name like 'a/u\_' || auth.uid()::text || '\_%');

  create policy ap_delete on storage.objects for delete to authenticated
    using (bucket_id = 'animal-photos' and name like 'a/u\_' || auth.uid()::text || '\_%');

  raise notice '[완료] animal-photos 정책 적용됨';
exception when others then
  raise notice '[건너뜀] 정책 적용 실패: % — Storage → Policies 에서 직접 넣으세요.', sqlerrm;
end $policy$;


/* ── 2-1. 탈퇴 때 새 버킷도 비우기 ───────────────────────────────────────
   v24 는 morph-images 만 지웁니다. 새 버킷이 생겼으니 같이 지워야 합니다.
   안 고치면 방침의 "탈퇴 즉시 사진 삭제" 가 다시 거짓이 됩니다. */
create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        dev text;
        p   public.profiles;
        n_photo int := 0;
        n_feed  int := 0;
        n2      int := 0;
begin
  if uid is null then raise exception 'not signed in'; end if;
  dev := 'u_' || uid::text;

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

  /* 사진 파일 — 두 버킷 모두. 옛 사진이 morph-images 에 남아 있을 수 있어
     양쪽을 다 지웁니다. 실패하면 일부러 터뜨립니다(v24 머리말 참고). */
  delete from storage.objects
   where bucket_id = 'animal-photos'
     and name like 'a/u\_' || uid::text || '\_%';
  get diagnostics n_photo = row_count;

  delete from storage.objects
   where bucket_id = 'morph-images'
     and name like 'a/u\_' || uid::text || '\_%';
  get diagnostics n2 = row_count;
  n_photo := n_photo + n2;

  delete from public.clutches where device = dev;
  delete from public.pairings where device = dev;
  delete from public.animals  where device = dev;

  delete from public.feed_items where user_id = uid;
  get diagnostics n_feed = row_count;

  update public.access_codes set revoked = true where redeemed_by = dev;
  delete from public.profiles where user_id = uid;
  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true, 'photos_deleted', n_photo,
                            'feed_items_deleted', n_feed);
end $$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;


/* ── 3. 확인 ─────────────────────────────────────────────────────────────
   버킷이 비공개인지. public 이 false 여야 합니다. */
select '버킷' as 항목, id, public as 공개여부
  from storage.buckets
 where id in ('morph-images', 'animal-photos')
 order by id;

/* 정책 4개가 붙었는지 */
select '정책' as 항목, policyname as 이름, cmd as 동작
  from pg_policies
 where tablename = 'objects' and policyname like 'ap\_%'
 order by policyname;

/* ⚠️ 옮겨야 할 옛 개체 사진 — 0 이 아니면 해당 개체에서 사진을 다시
   올려주세요. 버킷 사이 이동은 SQL 로 할 수 없습니다. */
select '옮겨야 할 옛 사진' as 항목, count(*) as 건수
  from storage.objects
 where bucket_id = 'morph-images' and name like 'a/%';


/* ── 4. 다 옮긴 뒤에만 실행 ──────────────────────────────────────────────
   위 3번이 0 이 될 때까지는 실행하지 마세요. 옛 파일을 지웁니다.

delete from storage.objects
 where bucket_id = 'morph-images' and name like 'a/%';
*/
