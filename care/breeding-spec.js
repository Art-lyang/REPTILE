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
      ko: '볼파이톤', calc: '/ballpython/',
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

     type 이 없는 유전자는 다중 대립인자 복합(볼파이톤 BEL 등)입니다.
     '이 개체가 무엇을 갖고 있나' 를 체크박스 하나로 물을 수 없어서 뺍니다.
     그 개체는 콤보 이름이나 메모로 적는 편이 정확합니다.

     슈퍼폼이 치사인 것(superNonViable)은 성체가 없으므로 목록에서 뺍니다 —
     보유 개체를 등록하는 자리이기 때문입니다. */
  /* 유전형 이름을 그 언어로. genos 항목은 gName 이 다루지 못하므로 직접 봅니다. */
  function genoName(v) {
    const L = has('LANG') ? get('LANG') : 'ko';
    return (v && (v[L] || v.ko || v.en)) || '';
  }

  function buildVisualOptions(spec) {
    if (spec.visualOptions) {
      const own = spec.visualOptions();
      if (own && own.length) return own;
    }
    const out = [], seen = {};
    const push = (tok, name) => {
      if (!tok || !name || !String(name).trim() || seen[tok]) return;
      seen[tok] = 1;
      out.push([tok, name]);
    };

    spec.genes().forEach(function (g) {
      if (!g) return;

      /* ── 같은 자리에 여러 대립인자가 오는 유전자 ──────────────────────
         크레스티드의 카푸치노·세이블, 팻테일의 패턴리스·스팅어가 그렇습니다.
         유전자 id('cs')는 자리 이름일 뿐 개체가 가질 수 있는 모프가 아닙니다.
         실제 토큰은 genos 안에 유전형별로 들어 있습니다.

             Cn → cappuccino    CC → super_cappuccino
             Sn → sable         SS → super_sable
             CS → luwak

         전에는 'cs' 를 그대로 내보냈는데, 그건 계산기가 모르는 값이라
         저장해도 콤보·역산 어디에도 걸리지 않았습니다.

         token 이 없는 유전형은 건너뜁니다 — nn(야생형)과 팻테일의 pn(헷
         패턴리스)이 그렇습니다. 헷은 눈에 보이지 않아 '발현 모프' 칸에
         들어갈 것이 아닙니다. */
      if (g.genos) {
        Object.keys(g.genos).forEach(function (key) {
          const v = g.genos[key];
          if (!v || !v.token) return;
          push(v.token, genoName(v));
        });
        return;
      }

      if (!g.type) return;                          // type 도 genos 도 없으면 다룰 수 없습니다
      push(g.id, nameOf(g));
      if (g.type !== 'incdom' || g.superNonViable) return;
      push('super_' + g.id, superNameOf(g));
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

  /* =============================================================================
     역산 — 목표 모프가 나오려면 부모가 무엇을 가져야 하는가
     -----------------------------------------------------------------------------
     확률을 계산하지 않습니다. 계산기가 이미 그걸 하고, 여기서 다시 구현하면
     두 곳의 답이 갈립니다. 여기서 답하는 것은 하나입니다 —
     **내가 가진 개체로 이 모프에 닿을 수 있는가, 없다면 무엇이 없는가.**

     대립인자 단위로 봅니다. 유전자 단위로 보면 세이블을 가진 개체가
     카푸치노를 만드는 데 도움이 되는 것처럼 나옵니다. 같은 자리에 있을 뿐
     다른 돌연변이인데도요.

       단순 유전자        대립인자 = 유전자 id
         rec 발현           양쪽 부모가 보유(het 이상)
         incdom 슈퍼        양쪽 부모가 보유
         incdom·dom 발현    한쪽만 보유해도 나옴
       유전형이 있는 자리   대립인자 = 유전형 키의 글자 (n 은 야생형)
         CC                 C 를 양쪽에서
         Cn                 C 를 한쪽에서
         CS                 C 를 한쪽, S 를 다른 쪽에서

     한 토큰이 여러 유전형에서 나올 수 있습니다 — 팻테일의 슈퍼 스팅어는
     ss 로도 ps 로도 나옵니다. 그럴 때는 경로를 모두 돌려주고, 그 중 하나라도
     닿으면 가능한 것으로 봅니다. 하나만 골라 보여주면 '안 된다' 는 잘못된
     답이 나올 수 있습니다.
     ============================================================================= */

  /* 토큰 → 그 토큰이 나오는 유전형들. 한 번 만들어 재사용합니다. */
  function buildTokenIndex(spec) {
    const idx = {};
    const add = (token, entry) => {
      if (!token) return;
      (idx[token] = idx[token] || []).push(entry);
    };
    spec.genes().forEach(function (g) {
      if (!g) return;
      if (g.genos) {
        Object.keys(g.genos).forEach(function (key) {
          const v = g.genos[key];
          if (!v || !v.token) return;
          /* 유전형 키의 글자가 곧 대립인자입니다. n 은 야생형이라 뺍니다. */
          const need = {};
          String(key).split('').forEach(function (ch) {
            if (ch === 'n') return;
            need[ch] = (need[ch] || 0) + 1;
          });
          add(v.token, { locus: g.id, gene: g, key: key, need: need });
        });
        return;
      }
      if (!g.type) return;
      const both = { [g.id]: 2 }, one = { [g.id]: 1 };
      add(g.id, { locus: g.id, gene: g, key: g.type === 'rec' ? 'homo' : 'het',
                  need: g.type === 'rec' ? both : one });
      if (g.type === 'incdom' && !g.superNonViable) {
        add('super_' + g.id, { locus: g.id, gene: g, key: 'homo', need: both });
      }
    });
    return idx;
  }

  /* 이 개체가 그 자리에서 그 대립인자를 넘겨줄 수 있는가.
     발현이든 het 이든 갖고만 있으면 넘길 수 있습니다. */
  function carriesAllele(idx, animal, locus, allele) {
    const toks = (animal.morphs || []).concat(animal.hets || []);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      /* 단순 유전자는 토큰이 곧 대립인자 이름입니다 (het 목록도 유전자 id) */
      if (t === allele || t === 'super_' + allele) return true;
      const entries = idx[t];
      if (!entries) continue;
      for (let j = 0; j < entries.length; j++) {
        const e = entries[j];
        if (e.locus === locus && e.need[allele]) return true;
      }
    }
    return false;
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
    /* 역산 — 목표 토큰들에 대해 '무엇이 필요하고 내게 있는가' 를 돌려줍니다.
       확률은 계산하지 않습니다 (위 머리말 참고). */
    goalCheck: function (tokens, animals) {
      const idx = this._idx || (this._idx = buildTokenIndex(spec));
      const mine = animals || [];
      const self = this;

      return (tokens || []).map(function (token) {
        const paths = idx[token] || [];
        const name = self.morphName(token);
        if (!paths.length) {
          return { token: token, name: name, known: false, ok: false, paths: [] };
        }
        const out = paths.map(function (p) {
          const needs = Object.keys(p.need).map(function (allele) {
            const holders = mine.filter(a => carriesAllele(idx, a, p.locus, allele));
            const count = p.need[allele];
            return {
              allele: allele,
              /* 같은 대립인자를 양쪽에서 받아야 하면 개체도 둘 이상 필요합니다.
                 한 마리를 자기 자신과 붙일 수는 없으니까요. */
              need: count,
              holders: holders,
              ok: holders.length >= count
            };
          });
          return { key: p.key, needs: needs, ok: needs.every(n => n.ok) };
        });
        return {
          token: token, name: name, known: true,
          ok: out.some(p => p.ok),
          paths: out
        };
      });
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
