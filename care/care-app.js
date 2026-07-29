/* =============================================================================
   케어 — 서버 연결
   -----------------------------------------------------------------------------
   Supabase 로 읽고 쓰는 것만 모읍니다. 화면은 여기 함수만 부르고, 계산은
   care-core.js 가 합니다.

   ---------------------------------------------------------------------------
   개체는 RPC 로, 케어는 표에 직접
   ---------------------------------------------------------------------------
   개체(animals)는 기존 브리딩 관리와 같은 데이터라 같은 통로를 씁니다.
   my_rows / save_row 를 거치면 로그인 안 한 기기 기록도 그대로 다뤄지고,
   무엇보다 브리딩 화면과 케어 화면이 서로 다른 규칙으로 같은 표를 만지는
   일이 없습니다.

   케어 기록(care_plans·care_records·weight_logs)은 표에 직접 씁니다.
   이유는 supabase_v16.sql 머리말에 적어두었습니다 — 요약하면 my_rows 가
   표 전체를 한 덩어리로 내려주는 구조라 매일 쌓이는 기록에는 못 씁니다.

   그래서 케어는 로그인이 필수입니다. user_id 는 보내지 않습니다.
   DB 트리거가 auth.uid() 로 채웁니다.
   ============================================================================= */

const CareApp = (function () {
  'use strict';

  const SB = (typeof SUPABASE_URL !== 'undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
    : null;

  let USER = null;
  let PREM = { active: false, kind: null, expires_at: null };

  /* 로그인 안 한 사람도 개체를 볼 수 있게 하는 기기 키.
     케어 기능 자체는 로그인이 필요하지만, my_rows 가 인자를 요구합니다. */
  function devId() {
    try {
      let d = localStorage.getItem('studioDevice') || localStorage.getItem('leoDevice');
      if (!d) {
        d = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem('studioDevice', d);
      }
      return d;
    } catch (e) { return 'dev_anon'; }
  }

  /* Supabase 오류를 그대로 화면에 던지면 영어 원문이 나옵니다. 자주 나오는
     것만 우리말로 바꾸고, 모르는 것은 원문을 붙여 둡니다 — 감추면 무슨 일이
     났는지 알 수 없게 됩니다. */
  function friendly(err) {
    const m = String((err && (err.message || err.msg)) || err || '');
    if (/row-level security|violates row-level/i.test(m)) return '내 기록이 아니거나 로그인이 풀렸습니다. 다시 로그인해 주세요.';
    if (/duplicate key|already exists/i.test(m)) return '이미 오늘 처리한 항목입니다.';
    if (/JWT|not signed in|401/i.test(m)) return '로그인이 필요합니다.';
    if (/Failed to fetch|NetworkError/i.test(m)) return '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
    if (/care_plans_cycle_ck/.test(m)) return '반복 주기를 하나만 골라 주세요 (며칠마다 또는 요일).';
    if (/weight_logs_grams_ck/.test(m)) return '체중은 0보다 크고 10000g 미만이어야 합니다.';
    return m || '알 수 없는 오류';
  }

  async function req(p) {
    const r = await p;
    if (r && r.error) throw new Error(friendly(r.error));
    return r ? r.data : null;
  }

  return {
    ready: !!SB,
    get user() { return USER; },
    get premium() { return PREM; },
    device: devId,
    friendly: friendly,

    /* ── 로그인 · 프리미엄 ─────────────────────────────────────────────── */
    async boot() {
      if (!SB) return;
      try {
        const s = await SB.auth.getSession();
        USER = (s.data && s.data.session) ? s.data.session.user : null;
      } catch (e) { USER = null; }

      if (USER) {
        try {
          const d = await SB.rpc('premium_status', { p_device: 'u_' + USER.id });
          PREM = (d && d.data) ? d.data : PREM;
        } catch (e) { /* 조회 실패 시 비활성으로 둡니다. 열어주는 쪽으로 틀리면 안 됩니다 */ }
      }
      return USER;
    },

    async signOut() { if (SB) await SB.auth.signOut(); },

    logVisit() {
      if (SB && window.StudioAnalytics) {
        try { window.StudioAnalytics.logVisit(SB, 'care', 'ko'); } catch (e) {}
      }
    },

    /* ── 개체 ──────────────────────────────────────────────────────────── */
    async listAnimals() {
      const rows = await req(SB.rpc('my_rows', { p_device: devId(), p_table: 'animals' }));
      return (rows || []).map(function (a) {
        /* species 칼럼을 붙이기 전에 만들어진 기록은 값이 없을 수 있습니다.
           v16 이 기본값을 넣지만, 그 SQL 을 아직 안 돌린 서버도 있습니다. */
        if (!a.species) a.species = 'leopard';
        return a;
      });
    },

    async saveAnimal(row) {
      return req(SB.rpc('save_row', { p_device: devId(), p_table: 'animals', p_row: row }));
    },

    async deleteAnimal(id) {
      return req(SB.rpc('delete_row', { p_device: devId(), p_table: 'animals', p_id: id }));
    },

    /* ── 사진 ──────────────────────────────────────────────────────────
       올리기 전에 줄입니다. 폰 사진은 4~12MB 라 그대로 두면 무료 저장소가
       금방 차고, 목록에서 20장을 받느라 한참 걸립니다.

       ⚠️ 이 버킷은 공개입니다. 주소를 아는 사람은 로그인 없이 사진을 볼 수
          있습니다. 공개 프로필이 사진을 보여주려면 그래야 하고, 대신
          '공개를 꺼도 사진 주소를 이미 받은 사람은 계속 본다' 는 것을
          공유 설정 화면에 적어두었습니다. */
    async uploadPhoto(file, onStep) {
      if (!USER) throw new Error('로그인이 필요합니다.');
      if (!window.ImgTool || !window.ImgTool.resize) {
        throw new Error('사진 도구를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      }
      const say = m => { try { onStep && onStep(m); } catch (e) {} };

      const mb = (file.size / 1048576).toFixed(1);
      say(file.size > 1048576 ? '사진을 줄이는 중… (' + mb + 'MB)' : '준비 중…');
      const blob = await window.ImgTool.resize(file, 900);
      say('올리는 중… (' + Math.round(blob.size / 1024) + 'KB 로 줄임)');

      /* 파일 이름에 계정 id 를 넣습니다. 버킷이 공개라 경로를 훑는 사람이
         있을 수 있는데, 무작위 부분이 있어야 남의 사진 주소를 맞힐 수 없습니다. */
      const rand = Math.random().toString(36).slice(2, 10);
      const path = 'a/' + ('u_' + USER.id).replace(/[^\w-]/g, '') + '_' + Date.now() + '_' + rand + '.jpg';

      const up = await SB.storage.from('morph-images')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw new Error(friendly(up.error));

      return SB.storage.from('morph-images').getPublicUrl(path).data.publicUrl;
    },

    /* ── 페어링 · 클러치 ───────────────────────────────────────────────
       개체와 같은 통로(my_rows/save_row)를 씁니다. 브리딩 화면이 쓰는
       세 표는 전부 이 RPC 화이트리스트 안에 있습니다 (supabase_v7.sql).

       v19 이후 save_row 는 수정할 때 기존 값과 합칩니다. 그래서 화면이 일부
       칸만 보내도 나머지가 지워지지 않습니다. */
    async listRows(table) {
      return (await req(SB.rpc('my_rows', { p_device: devId(), p_table: table }))) || [];
    },

    async saveRow(table, row) {
      return req(SB.rpc('save_row', { p_device: devId(), p_table: table, p_row: row }));
    },

    async deleteRow(table, id) {
      return req(SB.rpc('delete_row', { p_device: devId(), p_table: table, p_id: id }));
    },

    /* ── 반복 계획 ─────────────────────────────────────────────────────── */
    async listPlans() {
      return req(SB.from('care_plans').select('*').order('created_at', { ascending: true })) || [];
    },

    async savePlan(p) {
      const row = {
        animal_id: p.animal_id || null,
        kind: p.kind,
        title: p.title || null,
        detail: p.detail || null,
        feed_item_id: p.feed_item_id || null,
        interval_days: p.interval_days || null,
        weekdays: (p.weekdays && p.weekdays.length) ? p.weekdays : null,
        start_date: p.start_date || CareCore.today(),
        time_of_day: p.time_of_day || null,
        is_active: p.is_active !== false
      };
      if (p.id) return req(SB.from('care_plans').update(row).eq('id', p.id).select().single());
      return req(SB.from('care_plans').insert(row).select().single());
    },

    async deletePlan(id) {
      return req(SB.from('care_plans').delete().eq('id', id));
    },

    /* 여러 계획을 한 번에 (종별 기본값 넣기) */
    async addPlans(list) {
      if (!list.length) return [];
      return req(SB.from('care_plans').insert(list).select());
    },

    /* ── 기록 ──────────────────────────────────────────────────────────── */
    /* 최근 것만 가져옵니다. 표 전체를 내려받는 구조를 쓰지 않으려고 표에
       직접 붙였는데, 여기서 전부 긁어오면 같은 문제가 됩니다. */
    async listRecords(fromDate) {
      return req(SB.from('care_records').select('*')
        .gte('done_date', fromDate)
        .order('done_date', { ascending: false })
        .limit(2000)) || [];
    },

    async addRecord(r) {
      return req(SB.from('care_records').insert({
        animal_id: r.animal_id || null,
        plan_id: r.plan_id || null,
        kind: r.kind,
        done_date: r.done_date || CareCore.today(),
        title: r.title || null,
        detail: r.detail || null,
        note: r.note || null
      }).select().single());
    },

    async deleteRecord(id) {
      return req(SB.from('care_records').delete().eq('id', id));
    },

    /* 계획 하나를 오늘 완료 처리.
       DB 에 (plan_id, done_date) 유일 색인이 걸려 있어, 버튼을 빠르게 두 번
       눌러도 두 번째는 거부됩니다. 그걸 오류로 띄우면 사용자만 놀라므로
       '이미 처리됨' 으로 조용히 넘깁니다. */
    async completePlan(plan, dateStr) {
      const d = dateStr || CareCore.today();
      try {
        await this.addRecord({
          animal_id: plan.animal_id, plan_id: plan.id, kind: plan.kind,
          done_date: d, title: plan.title, detail: plan.detail
        });
      } catch (e) {
        if (!/이미 오늘 처리/.test(e.message)) throw e;
      }
      await req(SB.from('care_plans').update({ last_done_date: d }).eq('id', plan.id));
    },

    /* 완료 취소.
       last_done_date 도 함께 정리합니다. 오늘 할 일 판정은 care_records 를
       보고 하므로 이 칼럼을 안 고쳐도 화면은 맞게 나옵니다. 하지만 취소한
       날짜가 '마지막으로 한 날' 로 남아 있으면, 나중에 이 값을 믿고 짠 코드가
       조용히 틀립니다. 지울 수 있을 때 지워둡니다. */
    async undoPlan(plan, dateStr) {
      const d = dateStr || CareCore.today();
      await req(SB.from('care_records').delete().eq('plan_id', plan.id).eq('done_date', d));

      const left = await req(SB.from('care_records').select('done_date')
        .eq('plan_id', plan.id).order('done_date', { ascending: false }).limit(1));
      const prev = (left && left.length) ? left[0].done_date : null;
      return req(SB.from('care_plans').update({ last_done_date: prev }).eq('id', plan.id));
    },

    /* ── 체중 ──────────────────────────────────────────────────────────── */
    async listWeights(animalId) {
      let q = SB.from('weight_logs').select('*').order('measured_on', { ascending: true });
      if (animalId) q = q.eq('animal_id', animalId);
      return req(q.limit(2000)) || [];
    },

    /* 같은 날 다시 재면 덮어씁니다. (animal_id, measured_on) 유일 제약이
       있어 그냥 insert 하면 실패합니다. */
    async saveWeight(animalId, grams, dateStr, note) {
      return req(SB.from('weight_logs').upsert({
        animal_id: animalId,
        grams: grams,
        measured_on: dateStr || CareCore.today(),
        note: note || null
      }, { onConflict: 'animal_id,measured_on' }).select().single());
    },

    async deleteWeight(id) {
      return req(SB.from('weight_logs').delete().eq('id', id));
    },

    /* ── 먹이 · 용품 ───────────────────────────────────────────────────
       재고는 여기서 깎지 않습니다. 기록이 들어가면 DB 트리거가 같이 줄입니다
       (supabase_v20.sql 4장). 화면에서 두 번 부르면 하나만 성공했을 때
       기록과 재고가 어긋납니다. */
    async listFeeds() {
      return req(SB.from('feed_items').select('*').order('is_active', { ascending: false })
        .order('name', { ascending: true })) || [];
    },

    async saveFeed(f) {
      const row = {
        name: f.name,
        kind: f.kind || 'staple',
        brand: f.brand || null,
        unit: f.unit || 'g',
        per_use: f.per_use == null || f.per_use === '' ? null : Number(f.per_use),
        amount_left: f.amount_left == null || f.amount_left === '' ? null : Number(f.amount_left),
        amount_full: f.amount_full == null || f.amount_full === '' ? null : Number(f.amount_full),
        opened_on: f.opened_on || null,
        expires_on: f.expires_on || null,
        buy_url: f.buy_url || null,
        lead_days: f.lead_days == null || f.lead_days === '' ? 3 : parseInt(f.lead_days, 10),
        note: f.note || null,
        is_active: f.is_active !== false
      };
      if (f.id) return req(SB.from('feed_items').update(row).eq('id', f.id).select().single());
      return req(SB.from('feed_items').insert(row).select().single());
    },

    async deleteFeed(id) {
      return req(SB.from('feed_items').delete().eq('id', id));
    },

    /* 새로 사서 채우기. amount_full 을 모르면 넘어온 값을 씁니다. */
    async refillFeed(id, amount) {
      const row = { amount_left: Number(amount), opened_on: CareCore.today() };
      return req(SB.from('feed_items').update(row).eq('id', id).select().single());
    },

    /* ── 공유 ──────────────────────────────────────────────────────────
       animals 를 직접 update 하지 않고 함수를 부릅니다. 직접 고치게 열어두면
       공개 여부만 바꾸려던 정책이 개체 전체를 쓰기 가능하게 만듭니다.
       (supabase_v18.sql 3장) */
    async setShare(animalId, isPublic, note, showBreeder, rotate) {
      return req(SB.rpc('set_animal_share', {
        p_id: animalId,
        p_public: !!isPublic,
        p_note: note || null,
        p_breeder: !!showBreeder,
        p_rotate: !!rotate
      }));
    }
  };
})();

/* 최상위 const 는 window 에 붙지 않습니다. 같은 페이지의 다른 <script> 에서
   이름만으로 부를 수는 있지만, care-ui.js 가 window.CareApp 으로 찾고 있어
   여기서 명시적으로 답니다. care-core.js 끝부분과 같은 이유입니다. */
if (typeof window !== 'undefined') window.CareApp = CareApp;
