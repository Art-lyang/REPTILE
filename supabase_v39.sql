begin;
drop function if exists public.public_breeder_animals(text, integer);
notify pgrst, 'reload schema';
commit;
