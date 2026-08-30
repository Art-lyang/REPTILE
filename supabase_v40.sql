/* =============================================================================
   supabase_v40.sql — 신규 개체의 기본 공개 설정 NULL 차단
   -----------------------------------------------------------------------------
   save_row()는 jsonb_populate_record(null::animals, p_row)를 사용하므로 화면이
   보내지 않은 키에는 테이블 DEFAULT가 적용되지 않고 NULL이 들어갑니다.
   v34에서 public_weight를 추가한 뒤 기존 기본값 보정 트리거를 넓히지 않아
   신규 개체 등록이 23502로 거부됐습니다.

   여러 번 실행해도 안전합니다.
   ============================================================================= */

do $guard$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'animals'
       and column_name = 'public_weight'
  ) then
    raise exception 'animals.public_weight is missing; apply supabase_v34.sql first';
  end if;
end $guard$;

create or replace function public.animals_fill_species()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.species is null or btrim(new.species) = '' then
    new.species := 'leopard';
  end if;

  /* 비어 있는 공개 설정은 항상 비공개로 닫습니다. */
  if new.is_public      is null then new.is_public      := false; end if;
  if new.is_listed      is null then new.is_listed      := false; end if;
  if new.public_breeder is null then new.public_breeder := false; end if;
  if new.public_weight  is null then new.public_weight  := false; end if;

  /* 이후 추가된 NOT NULL 기본값도 구형 화면에서 안전하게 채웁니다. */
  if new.line_trait_scores is null then new.line_trait_scores := '{}'::jsonb; end if;
  if new.life_stage is null then new.life_stage := 'baby_unknown'; end if;

  return new;
end $$;

drop trigger if exists animals_species_fill on public.animals;
create trigger animals_species_fill
  before insert or update on public.animals
  for each row execute function public.animals_fill_species();

select tgname
  from pg_trigger
 where tgname = 'animals_species_fill' and not tgisinternal;

