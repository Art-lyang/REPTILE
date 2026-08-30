alter table public.pairings
  add column if not exists species text,
  add column if not exists target_morph text,
  add column if not exists calculation jsonb,
  add column if not exists calculated_at timestamptz;

update public.pairings p
set species = case coalesce(
  (select a.species from public.animals a where a.id = p.male limit 1),
  (select a.species from public.animals a where a.id = p.female limit 1),
  'gecko'
)
  when 'leopard' then 'gecko'
  when 'gecko' then 'gecko'
  when 'crested' then 'crested'
  when 'fattail' then 'fattail'
  when 'ballpython' then 'ballpython'
  else 'gecko'
end
where species is null
   or species not in ('gecko', 'crested', 'fattail', 'ballpython');

alter table public.pairings
  alter column species set default 'gecko',
  alter column species set not null;

alter table public.pairings drop constraint if exists pairings_species_ck;
alter table public.pairings
  add constraint pairings_species_ck
  check (species in ('gecko', 'crested', 'fattail', 'ballpython'));

alter table public.pairings drop constraint if exists pairings_target_morph_ck;
alter table public.pairings
  add constraint pairings_target_morph_ck
  check (target_morph is null or char_length(target_morph) between 1 and 120);

alter table public.pairings drop constraint if exists pairings_calculation_ck;
alter table public.pairings
  add constraint pairings_calculation_ck
  check (
    calculation is null
    or case
      when jsonb_typeof(calculation) = 'object'
       and jsonb_typeof(calculation->'parents') = 'object'
       and jsonb_typeof(calculation->'results') = 'array'
      then (calculation->>'version') = '1'
       and calculation->>'species' = species
       and jsonb_array_length(calculation->'results') between 1 and 128
       and octet_length(calculation::text) <= 65536
      else false
    end
  );
