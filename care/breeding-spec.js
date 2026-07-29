/* =============================================================================
   브리딩 어댑터 — 네 계산기 코어를 같은 얼굴로 감쌉니다
   -----------------------------------------------------------------------------
   브리딩 관리 화면이 필요로 하는 것은 생각보다 적습니다.

       비주얼 모프 목록   개체 등록의 체크박스
       het 목록           열성 보유 체크박스
       라인브리딩 형질     확률 계산 대상이 아니고 표시만
       모프 이름          토큰 → 사람이 읽는 이름
       콤보 이름          토큰 묶음 → 디자이너 명칭

   확률 계산은 안 씁니다. 페어링 탭은 예측이 아니라 기록·계획이기 때문입니다.
   그래서 종을 넓히는 데 유전 엔진을 새로 짤 필요가 없습니다.

   ---------------------------------------------------------------------------
   왜 코어를 고치지 않고 감싸는가
   ---------------------------------------------------------------------------
   네 코어는 각자 계산기 화면을 위해 자랐습니다. 이름이 다른 것은 사고가
   아니라 그동안의 사정입니다(GENES vs CR_ALL_GENES(), POLY vs CR_TRAITS).
   그걸 지금 통일하려면 계산기 네 개를 동시에 건드려야 하고, 그건 잘 돌고 있는
   것을 흔드는 일입니다.

   대신 이 파일 하나가 차이를 흡수합니다. 코어는 그대로 두고, 브리딩 화면은
   여기만 봅니다.

   ---------------------------------------------------------------------------
   ⚠️ 한 페이지에 코어는 하나만
   ---------------------------------------------------------------------------
   네 코어가 모두 최상위에서 const SERVICE_ID · LANG 을 선언합니다. 둘을 같이
   넣으면 'Identifier already declared' 로 페이지가 통째로 죽습니다.
   (docs/STUDIO.md 에 admin 이 같은 이유로 fetch+eval 을 쓰는 이야기가 있습니다)

   그래서 브리딩 화면은 ?species= 를 보고 코어 **하나만** 넣습니다. 이 파일은
   그 뒤에 실행되어, 지금 올라와 있는 것이 무엇인지 스스로 알아냅니다.
   ============================================================================= */
(function (global) {
  'use strict';

  /* 최상위 const 는 window 에 붙지 않지만 식별자로는 보입니다.
     없는 이름을 그냥 쓰면 ReferenceError 라 typeof 로만 확인합니다. */
  function has(name) {
    try { return eval('typeof ' + name) !== 'undefined'; } catch (e) { return false; }
  }
  function get(name) {
    try { return eval(name); } catch (e) { return undefined; }
  }

  /* 지금 어떤 코어가 올라와 있는가 */
  function detect() {
    if (has('BP_TRAITS')) return 'ballpython';
    if (has('CR_TRAITS')) return 'crested';
    if (has('FT_TRAITS')) return 'fattail';
    if (has('GENES'))     return 'gecko';
    return null;
  }

  /* 종마다 이름만 다른 것들을 여기 모읍니다.
     새 계산기가 생기면 이 표에 한 줄만 더하면 됩니다. */
  const MAP = {
    gecko: {
      ko: '레오파드 게코', calc: '/gecko/',
      genes: () => get('GENES') || [],
      traits: () => get('POLY') || [],
      traitGroup: t => t.line,
      matchCombo: s => (has('matchCombo') ? get('matchCombo')(s) : null),
      /* 레오파드는 이미 목록 함수를 갖고 있습니다. 다시 만들면 두 곳이 갈립니다. */
      visualOptions: () => (has('tokenOptions') ? get('tokenOptions')() : null),
      morphName: t => (has('morphNameOf') ? get('morphNameOf')(t) : t)
    },
    crested: {
      ko: '크레스티드 게코', calc: '/crested/',
      genes: () => (has('CR_ALL_GENES') ? get('CR_ALL_GENES')() : []),
      traits: () => get('CR_TRAITS') || [],
      traitGroup: t => t.grp,
      matchCombo: s => (has('crMatchCombo') ? get('crMatchCombo')(s) : null)
    },
    fattail: {
      ko: '아프리카 팻테일 게코', calc: '/fattail/',
      genes: () => (has('FT_ALL_GENES') ? get('FT_ALL_GENES')() : []),
      traits: () => get('FT_TRAITS') || [],
      traitGroup: t => t.grp,
      matchCombo: s => (has('ftMatchCombo') ? get('ftMatchCombo')(s) : null)
    },
    ballpython: {
      ko: '볼파이썬', calc: '/ballpython/',
      genes: () => (has('BP_ALL_GENES') ? get('BP_ALL_GENES')() : []),
      traits: () => get('BP_TRAITS') || [],
      traitGroup: t => t.grp,
      matchCombo: s => (has('bpMatchCombo') ? get('bpMatchCombo')(s) : null)
    }
  };

  /* 이름 꺼내기 — 네 코어가 공통으로 가진 몇 안 되는 함수입니다 */
  function nameOf(g) {
    if (has('gName')) { try { return get('gName')(g); } catch (e) {} }
    return g.ko || g.en || g.id;
  }
  /* gSuper 는 이름이 없으면 빈 문자열을 돌려줍니다. 그대로 쓰면 이름 없는
     체크박스가 생기므로, 빈 값이면 다음 후보로 넘어갑니다. */
  function superNameOf(g) {
    if (has('gSuper')) {
      try { const n = get('gSuper')(g); if (n && String(n).trim()) return n; } catch (e) {}
    }
    return g.superKo || g.superEn || '';
  }
  function traitName(t) {
    if (has('tName')) { try { return get('tName')(t); } catch (e) {} }
    if (has('pName')) { try { return get('pName')(t); } catch (e) {} }
    return t.ko || t.en || t.id;
  }

  /* 비주얼로 발현하는 토큰 목록.
     레오파드는 자기 함수를 쓰고, 나머지는 유전자에서 만듭니다.

       rec     보이려면 두 짝이 필요 → 토큰은 id 하나
       incdom  홑(id) 과 슈퍼(super_id) 가 따로 보임
       dom     id 하나

     type 이 없는 유전자는 다중 대립인자 복합(볼파이썬 BEL 등)입니다.
     '이 개체가 무엇을 갖고 있나' 를 체크박스 하나로 물을 수 없어서 뺍니다.
     그 개체는 콤보 이름이나 메모로 적는 편이 정확합니다.

     슈퍼폼이 치사인 것(superNonViable)은 성체가 없으므로 목록에서 뺍니다 —
     보유 개체를 등록하는 자리이기 때문입니다. */
  function buildVisualOptions(spec) {
    if (spec.visualOptions) {
      const own = spec.visualOptions();
      if (own && own.length) return own;
    }
    const out = [];
    spec.genes().forEach(function (g) {
      if (!g || !g.type) return;                    // 다중 대립인자 복합은 제외
      const base = nameOf(g);
      if (base && String(base).trim()) out.push([g.id, base]);

      /* kind:'multi' 는 같은 자리에 오는 대립인자입니다(카푸치노·세이블,
         패턴리스·스팅어). 동형 접합의 이름이 조합마다 따로 있어서
         (CC · SS · CS → 루왁 등, docs/STUDIO.md 참고) 'super_id' 토큰 하나로
         묶으면 어느 조합인지 알 수 없는 이름 없는 항목이 생깁니다.
         그런 개체는 콤보 이름이나 메모로 적는 편이 정확합니다. */
      if (g.type !== 'incdom' || g.kind === 'multi' || g.superNonViable) return;

      const sup = superNameOf(g);
      if (sup && String(sup).trim()) out.push(['super_' + g.id, sup]);
    });
    return out;
  }

  /* het 로 보유할 수 있는 것 = 열성만.
     우성·불완전우성은 갖고 있으면 보이므로 het 라는 개념이 없습니다. */
  function buildHetOptions(spec) {
    return spec.genes()
      .filter(g => g && g.type === 'rec')
      .map(g => [g.id, nameOf(g)]);
  }

  /* 라인브리딩 형질 — 확률 대상이 아니고 그룹으로 묶어 보여주기만 합니다 */
  function buildTraitOptions(spec) {
    return spec.traits().map(t => [t.id, traitName(t), spec.traitGroup(t) || '']);
  }

  const id = detect();
  const spec = id ? MAP[id] : null;

  global.BreedSpec = spec ? {
    id: id,
    ko: spec.ko,
    calc: spec.calc,
    /* 목록은 한 번 만들어 재사용합니다. 화면을 다시 그릴 때마다 41개
       유전자를 훑을 이유가 없습니다. */
    visualOptions: (function () { let c; return () => (c || (c = buildVisualOptions(spec))); })(),
    hetOptions:    (function () { let c; return () => (c || (c = buildHetOptions(spec))); })(),
    traitOptions:  (function () { let c; return () => (c || (c = buildTraitOptions(spec))); })(),
    morphName: function (token) {
      if (spec.morphName) { const n = spec.morphName(token); if (n) return n; }
      const all = this.visualOptions().concat(this.traitOptions().map(t => [t[0], t[1]]));
      const hit = all.filter(o => o[0] === token)[0];
      return hit ? hit[1] : token;
    },
    comboName: function (tokens) {
      try {
        const c = spec.matchCombo(new Set(tokens));
        if (!c) return null;
        const L = has('LANG') ? get('LANG') : 'ko';
        return c[L] || c.ko || c.en || null;
      } catch (e) { return null; }
    },
    /* 진단용 — 어댑터가 무엇을 찾았는지 한눈에 */
    summary: function () {
      return { species: id, genes: spec.genes().length,
               visuals: this.visualOptions().length,
               hets: this.hetOptions().length,
               traits: this.traitOptions().length };
    }
  } : null;
})(window);
