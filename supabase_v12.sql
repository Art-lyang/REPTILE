/* =============================================================================
   supabase_v12.sql — 크레스티드에 슈퍼트라이컬러(SPT) 추가
   -----------------------------------------------------------------------------
   Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
   여러 번 실행해도 안전합니다.

   ※ supabase_v4.sql 이 먼저 적용돼 있어야 합니다 (cr_traits 표).

   ---------------------------------------------------------------------------
   왜 유전 형질이 아니라 '표시 형질'로 넣었나
   ---------------------------------------------------------------------------
   슈퍼트라이컬러는 이름에 '슈퍼'가 붙지만, 릴리화이트나 카푸치노처럼 유전자
   한 자리를 두 개 가진 상태(동형접합)를 가리키는 말이 아닙니다. 발색과 패턴이
   어느 정도로 올라왔는지를 부르는 등급 표현에 가깝습니다.

   그래서 확률 계산에는 넣지 않고, 이미 있는 슈퍼하이포·슈퍼달마시안·
   슈퍼스트라이프와 같은 자리(fake_super)에 둡니다. 이렇게 두면 화면에

     "이름에 '슈퍼'가 붙지만 동형접합이 아니라 표현 강도를 뜻합니다 —
      슈퍼끼리 교배해도 100% 슈퍼가 나오지 않습니다."

   라는 안내가 자동으로 함께 나옵니다.

   만약 브리더분이 '이건 실제로 유전자로 유전된다' 고 하시면 이 자리가
   아니라 cr_genes 로 옮겨야 합니다. 그때 말씀해 주세요 — 확률 계산이
   달라지는 일이라 임의로 옮기지 않았습니다.

   ---------------------------------------------------------------------------
   이 파일 없이도 보입니다
   ---------------------------------------------------------------------------
   코드 쪽 기본 목록에도 넣어 두었으므로 배포만으로 화면에는 나옵니다.
   이 SQL 은 관리자 화면에서 이름·색·순서를 고칠 수 있게 표에 등록하는
   것입니다. cr_traits 에 이미 다른 형질이 등록돼 있다면 넣어 주세요.
   안 넣으면 목록 맨 앞으로 정렬됩니다(등록된 것만 순서를 갖기 때문입니다).
   ============================================================================= */

do $spt$
declare n int; base_ord int;
begin
  if to_regclass('public.cr_traits') is null then
    raise exception 'cr_traits 표가 없습니다. supabase_v4.sql 을 먼저 실행하세요.';
  end if;

  select count(*) into n from public.cr_traits;
  if n = 0 then
    raise notice 'cr_traits 가 비어 있습니다. 코드 기본 목록으로 동작하므로 넣지 않습니다.';
    return;
  end if;

  /* 트라이 바로 뒤에 놓습니다. 트라이가 없으면 베이스 그룹 맨 뒤로 보냅니다. */
  select ord into base_ord from public.cr_traits where id = 'tricolor';
  if base_ord is null then
    select coalesce(max(ord), 0) into base_ord from public.cr_traits where grp = 'base';
  end if;

  /* 뒤에 오는 것들을 한 칸씩 밀어 자리를 만듭니다 */
  update public.cr_traits set ord = ord + 1 where ord > base_ord;

  insert into public.cr_traits (id, grp, ko, en, ja, zh, color, fake_super, ord, active)
  values ('supertricolor', 'base',
          '슈퍼트라이컬러', 'Super Tricolor', 'スーパートライカラー', '超级三色',
          '#DBB87E', true, base_ord + 1, true)
  on conflict (id) do update set
    grp = excluded.grp, ko = excluded.ko, en = excluded.en,
    ja = excluded.ja, zh = excluded.zh, color = excluded.color,
    fake_super = excluded.fake_super, active = true;

  raise notice '✅ 슈퍼트라이컬러 등록 (순서 %)', base_ord + 1;
end $spt$;


/* ── 확인 — 베이스 모프 순서대로 ──────────────────────────────────────── */
select ord as 순서, id, ko as 이름,
       case when fake_super then '표현 등급 (유전 아님)' else '' end as 비고
  from public.cr_traits
 where grp = 'base'
 order by ord;
