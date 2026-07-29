/* =============================================================================
   supabase_v19.sql — v18 이 만든 not null 칼럼이 개체 등록을 다시 막았습니다
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v18.sql 까지 적용돼 있어야 합니다.

   ---------------------------------------------------------------------------
   같은 실수를 두 번 했습니다
   ---------------------------------------------------------------------------
   v17 이 species 를 채우는 트리거를 붙여 개체 등록을 고쳤습니다. 그런데 v18 이
   not null 칼럼을 세 개 더 만들었습니다.

       is_public       not null default false
       is_listed       not null default false
       public_breeder  not null default false

   save_row() 는 여전히 이렇게 넣습니다.

       insert into public.animals
       select * from jsonb_populate_record(null::public.animals, p_row)

   jsonb_populate_record 는 칼럼 기본값을 적용하지 않습니다. 화면이 안 보낸
   칼럼은 전부 NULL 이 되고, not null 이면 그 자리에서 거부됩니다.

       23502  null value in column "is_public" of relation "animals"

   species 를 고치면서 '앞으로 not null 칼럼을 더하면 같은 일이 난다' 는 것을
   적어두지 않아, 바로 다음 파일에서 그대로 반복했습니다.

   ---------------------------------------------------------------------------
   ⚠️ 앞으로 animals 에 not null 칼럼을 더하는 사람에게
   ---------------------------------------------------------------------------
   기본값을 적어두는 것만으로는 부족합니다. save_row() 를 거치는 저장은 그
   기본값을 못 받습니다. 아래 트리거에 그 칼럼을 함께 넣으세요. 넣지 않으면
   개체 등록·수정이 통째로 막히고, 화면에는 영문 오류만 뜹니다.

   근본적으로는 save_row 가 기본값을 살리도록 고치는 편이 낫습니다. 다만 그
   함수는 표 이름을 인자로 받는 범용 함수라, 표마다 기본값을 끌어오게 만들려면
   구조를 바꿔야 합니다. 지금은 animals 한 곳만 문제이므로 트리거로 막습니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='animals' and column_name='is_public') then
    raise exception E'animals.is_public 이 없습니다.\nsupabase_v18.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. 트리거를 넓힙니다 ────────────────────────────────────────────────
   v17 의 함수를 대체합니다. 이름을 그대로 두어 트리거는 다시 만들지 않아도
   됩니다 — create or replace 로 몸통만 바뀝니다.

   하는 일은 하나입니다: 비어 있는 not null 칼럼을 기본값으로 채운다. */
create or replace function public.animals_fill_species()
returns trigger language plpgsql set search_path = public as $$
begin
  /* v17 — 종 */
  if new.species is null or btrim(new.species) = '' then
    new.species := 'leopard';
  end if;

  /* v18 — 공개 설정 세 개.
     비어 있으면 '공개 안 함' 이 맞습니다. 판단이 안 서는 쪽으로 틀릴 때는
     닫아두는 편으로 가야 합니다. */
  if new.is_public      is null then new.is_public      := false; end if;
  if new.is_listed      is null then new.is_listed      := false; end if;
  if new.public_breeder is null then new.public_breeder := false; end if;

  return new;
end $$;

/* 트리거가 없을 수도 있으니(v17 을 건너뛴 DB) 다시 걸어둡니다. */
drop trigger if exists animals_species_fill on public.animals;
create trigger animals_species_fill
  before insert or update on public.animals
  for each row execute function public.animals_fill_species();


/* ── 1-2. save_row 가 수정할 때 기존 값을 지키게 합니다 ⚠️ 여기가 핵심 ────
   위 트리거는 '새로 넣을 때' 만 구해줍니다. 더 큰 문제가 따로 있었습니다.

   save_row 는 수정을 '지우고 다시 넣기' 로 합니다. 그래서 화면이 보내지 않은
   칼럼은 전부 사라집니다. 지금까지는 화면 하나(브리딩 관리)가 거의 모든
   칼럼을 실어 보내서 티가 안 났을 뿐입니다.

   v18 이 공유 기능을 붙이면서 이게 실제 피해가 됩니다.

     · 개체를 공개해 QR 을 뿌린다
     · 나중에 브리딩 관리에서 이름만 고친다
     · 그 화면은 share_token·is_public·public_note·photos 를 안 보냄
     · 저장하는 순간 공유 주소가 사라지고, 뿌린 QR 이 전부 죽는다

   사용자는 이름만 고쳤는데 왜 링크가 죽었는지 알 수 없습니다. 화면마다
   '빠뜨리지 말아야 할 칼럼 목록' 을 들고 다니게 하는 것은 답이 아닙니다.
   언젠가 한 곳은 빠뜨립니다.

   그래서 서버에서 합칩니다. id 가 있고 그것이 내 기록이면, 기존 행 위에
   보내온 값만 덮어씁니다. 안 보낸 칼럼은 그대로 남습니다.

   새로 넣는 경우(id 없음)는 예전과 같습니다. */
create or replace function public.save_row(p_device text, p_table text, p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare newid uuid; u uuid := auth.uid(); okey text; cur jsonb;
begin
  if p_table not in ('animals','pairings','clutches') then
    raise exception 'bad table';
  end if;

  p_row := p_row - 'device' - 'user_id';

  /* ── 기존 값과 합치기 (이 블록이 v19 에서 새로 들어간 부분입니다) ──
     내 기록일 때만 읽습니다. 남의 id 를 적어 보내면 아무것도 못 읽고,
     아래 delete 가 0건이 되어 결국 기본키 충돌로 막힙니다. */
  if coalesce(p_row->>'id','') <> '' then
    if u is not null then
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.user_id = $2', p_table)
        into cur using (p_row->>'id')::uuid, u;
    else
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.device = $2 and t.user_id is null', p_table)
        into cur using (p_row->>'id')::uuid, p_device;
    end if;
    if cur is not null then
      /* 오른쪽이 이깁니다 — 보내온 값이 기존 값을 덮고, 안 보낸 것은 남습니다. */
      p_row := cur || p_row;
    end if;
  end if;

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

revoke all on function public.save_row(text,text,jsonb) from public;
grant execute on function public.save_row(text,text,jsonb) to anon, authenticated;


/* ── 2. 이미 들어간 빈 값 정리 ───────────────────────────────────────────
   not null 이라 NULL 은 없어야 하지만, 확인 삼아 둡니다. */
update public.animals
   set species        = coalesce(nullif(btrim(coalesce(species,'')),''), 'leopard'),
       is_public      = coalesce(is_public, false),
       is_listed      = coalesce(is_listed, false),
       public_breeder = coalesce(public_breeder, false)
 where species is null or btrim(coalesce(species,'')) = ''
    or is_public is null or is_listed is null or public_breeder is null;


/* ── 3. 확인 ─────────────────────────────────────────────────────────────
   'not null 인데 트리거가 안 채우는 칼럼' 이 남아 있는지 봅니다.
   여기에 뭔가 나오면 그 칼럼도 위 트리거에 넣어야 합니다. */
select 'not null 칼럼 점검' as 항목,
       column_name as 칼럼,
       column_default as 기본값,
       case when column_name in ('id','device','species','is_public','is_listed','public_breeder')
            then '처리됨' else '⚠️ 트리거에 없음 — save_row 로 저장 시 막힙니다' end as 상태
  from information_schema.columns
 where table_schema = 'public' and table_name = 'animals' and is_nullable = 'NO'
 order by 2;

select '트리거' as 항목, tgname as 이름
  from pg_trigger
 where tgrelid = 'public.animals'::regclass and not tgisinternal;
