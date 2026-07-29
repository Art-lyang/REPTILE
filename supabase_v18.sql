/* =============================================================================
   supabase_v18.sql — 개체 공개 프로필 (QR · 링크 공유)
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v17.sql 이 먼저 적용돼 있어야 합니다.

   ---------------------------------------------------------------------------
   무엇을 만드나
   ---------------------------------------------------------------------------
   개체마다 공유 주소를 하나씩 만들 수 있게 합니다. 주인이 켜면 그 주소를 받은
   사람은 로그인 없이 그 개체의 '보여주기로 한 것' 만 볼 수 있습니다.

       /care/p.html?t=<share_token>

   ---------------------------------------------------------------------------
   ⚠️ 이 파일에서 가장 중요한 결정 — 표를 열지 않습니다
   ---------------------------------------------------------------------------
   공개 개체에 대해 animals 에 select 정책을 여는 방법도 있습니다. 쓰지
   않았습니다. 그렇게 하면 **그 행의 모든 칼럼**이 나갑니다. 지금은 괜찮아
   보여도, 나중에 누가 animals 에 칼럼을 하나 더하는 순간 그것도 같이 공개
   됩니다. 더한 사람은 그 사실을 모릅니다.

   대신 함수 하나만 열고, 그 안에서 내보낼 칼럼을 손으로 적습니다. 적지 않은
   것은 절대 나가지 않습니다. 칼럼이 늘어도 여기를 고치지 않는 한 안전합니다.

   ---------------------------------------------------------------------------
   비공개 메모와 공개 소개글을 나눕니다
   ---------------------------------------------------------------------------
   animals.note 는 주인이 자기만 보려고 적은 것입니다. "성격 사나움", "OO에게
   삼", 가격 같은 것이 들어 있을 수 있습니다. 그걸 공개 화면에 그대로 내보내면
   사고입니다.

   그래서 public_note 를 따로 둡니다. 공개 화면에는 이것만 나갑니다.
   note 는 어떤 경로로도 나가지 않습니다.

   ---------------------------------------------------------------------------
   주소를 개체 id 로 쓰지 않는 이유
   ---------------------------------------------------------------------------
   id 를 주소에 쓰면 한 번 공개한 개체는 영영 그 주소로 열립니다. 비공개로
   되돌려도 주소는 이미 남의 손에 있습니다. 나중에 다시 공개하면 예전에 받은
   사람이 전부 다시 들어옵니다.

   share_token 은 따로 만들고 다시 만들 수 있게 합니다. 새로 만들면 예전 주소는
   그 순간 죽습니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception 'animals 표가 없습니다.';
  end if;
  if to_regprocedure('public.animals_fill_species()') is null then
    raise exception E'supabase_v17.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. 칼럼 ─────────────────────────────────────────────────────────────
   is_public 이 꺼져 있으면 share_token 이 있어도 아무것도 나가지 않습니다.
   토큰은 '주소', is_public 은 '열려 있는가' 로 나눠 둡니다. 토큰을 지우지
   않고 잠깐 닫았다가 같은 주소로 다시 열 수 있어야 하기 때문입니다. */
/* is_public 과 is_listed 를 나눕니다. 이건 꼭 나눠야 합니다.

   "링크를 받은 사람에게 보여준다" 와 "누구나 구경할 수 있는 목록에 올린다" 는
   전혀 다른 결정입니다. 분양 상대 한 사람에게 보여주려고 켠 것이 갤러리에
   같이 올라가면, 주인은 자기가 그런 선택을 한 줄도 모릅니다.

   is_listed 는 is_public 이 켜져 있을 때만 뜻이 있습니다. 아래 목록 함수가
   두 조건을 모두 봅니다. */
alter table public.animals add column if not exists share_token    text;
alter table public.animals add column if not exists is_public      boolean not null default false;
alter table public.animals add column if not exists is_listed      boolean not null default false;
alter table public.animals add column if not exists public_note    text;
alter table public.animals add column if not exists public_breeder boolean not null default false;
alter table public.animals add column if not exists photos         text[];

/* 토큰은 겹치면 안 됩니다. 겹치면 남의 개체가 열립니다. */
create unique index if not exists animals_share_token_uidx
  on public.animals(share_token) where share_token is not null;


/* ── 2. 토큰 만들기 ──────────────────────────────────────────────────────
   base64url 22자. gen_random_bytes(16) = 128비트라 찍어서 맞힐 수 없습니다.

   +/ 를 -_ 로 바꾸고 = 를 떼는 것은 주소에 그대로 쓰기 위해서입니다.
   그냥 base64 를 쓰면 / 가 경로 구분자로, + 가 공백으로 읽힙니다. */
create or replace function public.new_share_token()
returns text language sql volatile set search_path = public, extensions as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;


/* ── 3. 주인이 공개 설정을 바꾼다 ────────────────────────────────────────
   화면이 animals 를 직접 update 하지 않게 함수로 감쌉니다. 직접 열어두면
   is_public 과 함께 다른 칼럼도 바꿀 수 있는 정책이 필요해지고, 그건 개체
   전체를 쓰기 가능하게 만드는 것과 같습니다.

   p_rotate 가 true 면 토큰을 새로 만듭니다 — 예전 주소를 죽이는 유일한 방법. */
create or replace function public.set_animal_share(
  p_id uuid,
  p_public boolean,
  p_note text default null,
  p_breeder boolean default false,
  p_rotate boolean default false,
  p_listed boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.animals;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;

  select * into a from public.animals where id = p_id and user_id = auth.uid();
  if not found then raise exception '내 개체가 아닙니다'; end if;

  update public.animals
     set is_public      = coalesce(p_public, false),
         /* 공개를 끄면 목록 노출도 함께 꺼집니다. 공개가 아닌데 목록에만
            남아 있는 상태는 있을 수 없습니다. */
         is_listed      = coalesce(p_public, false) and coalesce(p_listed, false),
         public_note    = nullif(btrim(coalesce(p_note, '')), ''),
         public_breeder = coalesce(p_breeder, false),
         share_token    = case
                            when p_rotate or share_token is null then public.new_share_token()
                            else share_token
                          end
   where id = p_id
   returning * into a;

  return jsonb_build_object('ok', true, 'token', a.share_token,
                            'is_public', a.is_public, 'is_listed', a.is_listed);
end $$;

/* 인자가 하나 늘어 옛 서명이 남아 있으면 둘 다 존재하게 됩니다. 지웁니다. */
drop function if exists public.set_animal_share(uuid, boolean, text, boolean, boolean);
revoke all on function public.set_animal_share(uuid, boolean, text, boolean, boolean, boolean) from public;
grant execute on function public.set_animal_share(uuid, boolean, text, boolean, boolean, boolean) to authenticated;


/* ── 3-2. 공개 목록 (갤러리) ─────────────────────────────────────────────
   계산기 하단의 '다른 집사들의 개체 구경하기' 가 여기로 옵니다.

   is_public 과 is_listed 를 **둘 다** 봅니다. 링크로만 공유하려던 개체는
   여기 나오지 않습니다.

   내보내는 칸은 public_animal 보다 더 좁습니다 — 목록에는 카드에 필요한
   것만 있으면 되고, 자세한 것은 눌러 들어가서 봅니다. 부모·소개글·해칭일은
   목록에 넣지 않습니다. 적게 내보낼수록 실수할 여지가 적습니다.

   정렬을 created_at 으로 하지 않습니다. 그러면 목록 순서가 곧 등록 시각이
   되어, 누가 언제 무엇을 등록했는지 밖에서 읽힙니다. 토큰 해시로 섞습니다. */
create or replace function public.public_animals(
  p_species text default null,
  p_limit   int  default 24,
  p_offset  int  default 0
) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
             'token',   a.share_token,
             'name',    a.name,
             'species', a.species,
             'sex',     a.sex,
             'morphs',  coalesce(a.morphs, '{}'),
             'photo',   coalesce(a.photo_url, (a.photos)[1])
           ) as x
      from public.animals a
     where a.is_public = true
       and a.is_listed = true
       and a.share_token is not null
       and (p_species is null or p_species = '' or a.species = p_species)
     order by md5(a.share_token)
     limit greatest(1, least(coalesce(p_limit, 24), 60))
    offset greatest(0, coalesce(p_offset, 0))
  ) q;
$$;

revoke all on function public.public_animals(text, int, int) from public;
grant execute on function public.public_animals(text, int, int) to anon, authenticated;


/* ── 4. 공개 조회 ────────────────────────────────────────────────────────
   ⚠️ 내보내는 칸을 여기서 손으로 적습니다. 여기 없는 것은 나가지 않습니다.
      새 칼럼을 animals 에 더해도 이 함수를 고치지 않는 한 그대로입니다.

   내보내지 않는 것 (일부러):
     note            주인 전용 메모
     device·user_id  누구 것인지
     created_at      등록 시각
     color_grade     라인브리딩 평가 — 주관적 값이라 공개 의미가 없음
     케어·체중·증세  아예 다른 표이고, 여기서 건드리지 않음

   부모는 이름과 모프만, 그것도 **같은 주인의 개체일 때만** 보여줍니다.
   부모의 메모나 공개 여부와 무관하게 이름만 나갑니다. 부모가 따로 공개돼
   있으면 그 주소도 함께 주어 타고 들어갈 수 있게 합니다. */
create or replace function public.public_animal(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.animals;
        nick text;
        parent jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then return null; end if;

  select * into a
    from public.animals
   where share_token = p_token and is_public = true;
  if not found then return null; end if;

  if a.public_breeder then
    select nullif(btrim(coalesce(p.nickname, '')), '') into nick
      from public.profiles p where p.user_id = a.user_id;
  end if;

  select coalesce(jsonb_object_agg(side, info), '{}'::jsonb) into parent
    from (
      select s.side,
             jsonb_build_object(
               'name',   p.name,
               'morphs', p.morphs,
               'hets',   p.hets,
               'token',  case when p.is_public then p.share_token else null end
             ) as info
        from (values ('a', a.parent_a), ('b', a.parent_b)) as s(side, pid)
        join public.animals p
          on p.id = s.pid
         and p.user_id = a.user_id          -- 남의 개체를 부모로 적어두었어도 안 나갑니다
    ) q;

  return jsonb_build_object(
    'name',       a.name,
    'species',    a.species,
    'sex',        a.sex,
    'hatch_date', a.hatch_date,
    'morphs',     coalesce(a.morphs, '{}'),
    'hets',       coalesce(a.hets,   '{}'),
    'photo_url',  a.photo_url,
    'photos',     coalesce(a.photos, '{}'),
    'note',       a.public_note,           -- ⚠️ a.note 가 아닙니다
    'breeder',    nick,
    'parents',    coalesce(parent, '{}'::jsonb)
  );
end $$;

revoke all on function public.public_animal(text) from public;
grant execute on function public.public_animal(text) to anon, authenticated;


/* ── 5. 탈퇴하면 공개도 함께 사라집니다 ──────────────────────────────────
   delete_my_account() 가 animals 를 지우므로 공개 주소도 같이 죽습니다.
   따로 할 일은 없지만, 확인해 두는 뜻으로 적어 둡니다. */


/* ── 6. 확인 ─────────────────────────────────────────────────────────────
   함수 두 개가 있어야 하고, 공개 개체가 몇 마리인지 보입니다. */
select '함수' as 항목, routine_name as 이름
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('new_share_token', 'set_animal_share', 'public_animal')
 order by 2;

select '공개 설정' as 항목,
       count(*) filter (where is_public)            as 공개중,
       count(*) filter (where share_token is not null) as 주소발급됨,
       count(*)                                     as 전체
  from public.animals;

/* 비공개 메모가 공개 칸으로 새지 않았는지 — 항상 0 이어야 합니다. */
select '메모 유출 점검' as 항목, count(*) as 건수
  from public.animals
 where public_note is not null and note is not null and public_note = note;
