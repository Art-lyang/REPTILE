/* =============================================================================
   supabase_v17.sql — species 때문에 개체 등록이 막힌 것을 고칩니다
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v16.sql 이 먼저 적용돼 있어야 합니다.

   ---------------------------------------------------------------------------
   무엇이 잘못됐나
   ---------------------------------------------------------------------------
   v16 이 animals 에 species 를 not null default 'leopard' 로 넣었습니다.
   기본값이 있으니 안 보내도 채워질 거라고 봤는데, 그렇지 않았습니다.

   개체 저장은 save_row() 를 거치고, 그 안은 이렇게 되어 있습니다.

       insert into public.animals
       select * from jsonb_populate_record(null::public.animals, p_row)

   jsonb_populate_record 는 **칼럼 기본값을 적용하지 않습니다.** 첫 인자가
   null 이면 jsonb 에 없는 칼럼은 전부 NULL 이 됩니다. 그 NULL 이 그대로
   insert 되면서 not null 제약에 걸립니다.

       23502  null value in column "species" of relation "animals"

   그래서 species 를 실어 보내지 않는 화면은 개체를 등록할 수 없게 됐습니다.
   브리딩 관리(gecko/breeding.html)가 여기 해당합니다 — 레오파드 전용 폼이라
   종을 물어보지 않습니다. v16 을 적용한 순간부터 그 화면의 개체 등록이
   막혀 있었습니다.

   ---------------------------------------------------------------------------
   어떻게 고치나
   ---------------------------------------------------------------------------
   화면만 고치면 지금 열려 있는 옛 탭이나 캐시된 파일은 계속 실패합니다.
   저장 경로 어디로 들어와도 통하도록 표에서 막습니다.

   트리거는 not null 검사보다 먼저 돕니다. 그래서 species 가 비어 있으면
   트리거가 채우고, 제약은 이미 채워진 값을 봅니다.

   기본값을 여기에도, 칼럼에도 두는 것이 중복처럼 보이지만 쓰임이 다릅니다.
   칼럼 기본값은 평범한 insert 에, 트리거는 명시적으로 NULL 이 들어올 때에
   각각 듭니다. jsonb_populate_record 는 후자입니다.
   ============================================================================= */


/* ── 0. 안전장치 ─────────────────────────────────────────────────────── */
do $guard$
begin
  if to_regclass('public.animals') is null then
    raise exception 'animals 표가 없습니다.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='animals' and column_name='species') then
    raise exception E'animals.species 가 없습니다.\nsupabase_v16.sql 을 먼저 실행하세요.';
  end if;
end $guard$;


/* ── 1. 빈 species 를 채우는 트리거 ──────────────────────────────────────
   update 에도 겁니다. save_row 는 수정할 때 지우고 다시 넣지만, 나중에
   표를 직접 update 하는 코드가 생기면 그쪽도 같은 함정을 밟습니다.

   빈 문자열도 함께 봅니다. 화면에서 select 값을 못 읽으면 '' 이 오는데,
   그건 not null 을 통과하면서 어느 종도 아닌 값으로 남습니다. */
create or replace function public.animals_fill_species()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.species is null or btrim(new.species) = '' then
    new.species := 'leopard';
  end if;
  return new;
end $$;

drop trigger if exists animals_species_fill on public.animals;
create trigger animals_species_fill
  before insert or update on public.animals
  for each row execute function public.animals_fill_species();


/* ── 2. 이미 들어간 빈 값 정리 ───────────────────────────────────────────
   not null 이라 NULL 은 없어야 하지만, v16 적용 전에 만들어진 행이나
   빈 문자열이 남아 있을 수 있습니다. */
update public.animals
   set species = 'leopard'
 where species is null or btrim(species) = '';


/* ── 3. 기록 종류 넓히기 ─────────────────────────────────────────────────
   강아지·고양이 케어 앱들이 공통으로 남기는 것 중 파충류에 그대로 오는 것을
   더합니다. 개·고양이 앱의 '산책·미용' 자리에 파충류는 다른 것이 옵니다.

     shed     탈피    — 주기가 흐트러지면 습도·영양을 먼저 의심하는 신호
     poop     배변    — 개·고양이 앱도 거의 다 남깁니다
     refusal  거식    — 먹이를 거부한 날. 파충류에서 가장 먼저 보는 항목

   거식은 '급여를 안 한 날' 과 다릅니다. 줬는데 안 먹은 것이라 따로 세야
   합니다. 급여 기록이 없는 것과 같이 묶으면 둘 다 뜻을 잃습니다.

   계획(care_plans)에는 넣지 않습니다. 탈피와 거식은 일정을 잡아 하는 일이
   아니라 일어나면 적는 일입니다. 반복 주기를 물어보는 것 자체가 말이 안 됩니다.
   그래서 care_records 의 제약만 넓힙니다. */
alter table public.care_records drop constraint if exists care_records_kind_ck;
alter table public.care_records add constraint care_records_kind_ck
  check (kind in ('feed','water','clean','bedding','supplement','weigh','health',
                  'memo','behavior','custom',
                  'shed','poop','refusal'));


/* ── 4. 확인 ─────────────────────────────────────────────────────────────
   트리거가 붙었는지, 빈 값이 없는지 봅니다. */
select '트리거' as 항목, tgname as 이름,
       case when tgenabled = 'O' then '켜짐' else tgenabled::text end as 상태
  from pg_trigger
 where tgrelid = 'public.animals'::regclass and not tgisinternal
 order by 1;

select '개체 종별' as 항목, species as 종, count(*) as 마리
  from public.animals group by species order by 3 desc;

select '빈 species' as 항목, count(*) as 건수
  from public.animals where species is null or btrim(species) = '';
