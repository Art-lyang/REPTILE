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
  const PlanStore = window.CarePlanStore;
  const ERROR_MESSAGES = Object.freeze({
    ownership: '내 기록이 아니거나 로그인이 풀렸습니다. 다시 로그인해 주세요.',
    duplicate: '이미 오늘 처리한 항목입니다.', login: '로그인이 필요합니다.',
    network: '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    cycle: '반복 주기를 하나만 골라 주세요 (며칠마다, 요일 또는 주간 횟수).',
    weight: '체중은 0보다 크고 10000g 미만이어야 합니다.',
    hatch: '해칭일은 오늘보다 미래로 설정할 수 없습니다.',
    link: '페어링 연결 정보가 현재 개체·종과 맞지 않습니다. 목록을 새로고침한 뒤 다시 선택해 주세요.',
    parent: '부모 개체 조건이 맞지 않습니다. 성체 수컷과 성체 암컷을 다시 선택해 주세요.',
    mating: '메이팅 그룹의 개체·혈통 연결 조건이 맞지 않습니다. 성체 개체를 다시 선택해 주세요.',
    matingHistory: '기록이나 클러치가 있는 암컷은 메이팅 그룹에서 뺄 수 없습니다. 그룹을 종료 상태로 보관해 주세요.',
    hatchOutcome: '알 상태와 부화 결과를 확인해 주세요. 부화 수만큼만 새끼 개체를 등록할 수 있습니다.',
    data: '입력한 정보를 저장할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
    unknown: '처리 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.'
  });

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

  /* Supabase 오류를 그대로 화면에 던지면 영어 원문과 내부 구조가 노출됩니다.
     안정적인 오류 코드로 분류해 화면에는 번역 가능한 안내만 보내고, 원문은
     개발자가 확인할 수 있도록 브라우저 콘솔에만 남깁니다. */
  function errorKey(err) {
    if (err && err.careErrorKey) return String(err.careErrorKey);
    const m = String((err && (err.message || err.msg)) || err || '');
    const code = String((err && err.code) || '');
    if (/row-level security|violates row-level|내 기록이 아니거나/i.test(m)) return 'ownership';
    if (/duplicate key|already exists|이미 오늘/i.test(m) || code === '23505') return 'duplicate';
    if (/JWT|not signed in|401|로그인이 필요/i.test(m)) return 'login';
    if (/Failed to fetch|NetworkError|서버에 연결하지/i.test(m)) return 'network';
    if (/care_plans_(?:cycle|weekly_target)_ck|반복 주기/i.test(m)) return 'cycle';
    if (/weight_logs_grams_ck|체중은 0보다/i.test(m)) return 'weight';
    if (/hatch_date cannot be in the future|해칭일은 오늘보다/i.test(m)) return 'hatch';
    if (/pairing not found|clutch and pairing (?:owners|species) must match|pairing does not belong/i.test(m)) return 'link';
    if (/CARE_MATING_GROUP_MEMBER_HAS_HISTORY/i.test(m)) return 'matingHistory';
    if (/CARE_CLUTCH_|clutches_outcome_counts_ck/i.test(m)) return 'hatchOutcome';
    if (/CARE_MATING_(?:GROUP|EVENT)/i.test(m)) return 'mating';
    if (/CARE_(?:PARENT|SIRE|DAM|LINKED_SIRE|LINKED_DAM|LINKED_PAIRING)/i.test(m)) return 'parent';
    if (/null value in column|not-null constraint|violates check constraint|invalid input syntax/i.test(m)
        || /^(?:23502|23514|22P02|PGRST202|PGRST204|42703)$/.test(code)) return 'data';
    return null;
  }

  function friendly(err) {
    const key = errorKey(err);
    if (key) return ERROR_MESSAGES[key];
    return ERROR_MESSAGES.unknown;
  }

  function userError(err) {
    const key = errorKey(err) || 'unknown';
    const wrapped = new Error(ERROR_MESSAGES[key] || ERROR_MESSAGES.unknown);
    wrapped.careErrorKey = key;
    wrapped.code = String((err && err.code) || '');
    return wrapped;
  }

  async function req(p) {
    const r = await p;
    if (r && r.error) {
      try { console.error('[CareApp]', r.error); } catch (ignore) {}
      throw userError(r.error);
    }
    return r ? r.data : null;
  }

  return {
    ready: !!SB,
    /* 사진 서명에 쓰라고 내보냅니다. 화면 쪽에서 Supabase 를 다시 만들면
       로그인 세션이 갈라져서 자기 사진도 서명을 못 받습니다. */
    get sb() { return SB; },
    get user() { return USER; },
    get premium() { return PREM; },
    device: devId,
    friendly: friendly,
    errorKey: errorKey,

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

    logVisit(lang) {
      if (SB && window.StudioAnalytics) {
        try { window.StudioAnalytics.logVisit(SB, 'care', lang || 'ko'); } catch (e) {}
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

    async saveAnimal(row, initialWeight) {
      const payload = Object.assign({
        is_public: false, is_listed: false, public_breeder: false, public_weight: false,
        line_trait_scores: {}, life_stage: 'baby_unknown'
      }, row || {});
      if (initialWeight !== null && initialWeight !== undefined && initialWeight !== '') {
        return req(SB.rpc('save_animal_with_initial_weight', {
          p_device: devId(), p_row: payload, p_grams: Number(initialWeight), p_measured_on: null
        }));
      }
      return req(SB.rpc('save_row', { p_device: devId(), p_table: 'animals', p_row: payload }));
    },

    async deleteAnimal(id) {
      return req(SB.rpc('delete_row', { p_device: devId(), p_table: 'animals', p_id: id }));
    },

    /* ── 사진 ──────────────────────────────────────────────────────────
       올리기 전에 줄입니다. 폰 사진은 4~12MB 라 그대로 두면 무료 저장소가
       금방 차고, 목록에서 20장을 받느라 한참 걸립니다.

       버킷은 비공개입니다. 본인 사진과 공개 프로필에 연결된 사진만
       Storage 정책으로 읽을 수 있고, 화면에는 만료되는 서명 주소를 씁니다. */
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

      /* 파일 이름에 계정 id 를 넣습니다. 정책이 이 접두사로 주인을 가리므로
         (supabase_v25.sql) 마음대로 바꾸면 안 올라갑니다. 무작위 부분은
         남이 경로를 맞히지 못하게 하는 용도로 그대로 둡니다. */
      const rand = Math.random().toString(36).slice(2, 10);
      const path = 'a/' + ('u_' + USER.id).replace(/[^\w-]/g, '') + '_' + Date.now() + '_' + rand + '.jpg';

      /* 비공개 버킷입니다. 공개 버킷(morph-images)에 두면 주소가 한 번
         나간 뒤로는 회수할 방법이 없습니다. */
      const up = await SB.storage.from(window.Photo.BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw userError(up.error);

      /* 저장해 두는 문자열입니다. 이 주소로는 사진이 안 열립니다 —
         비공개니까요. 화면에 그릴 때 Photo 가 여기서 경로를 잘라내
         서명 주소를 받아옵니다. 예전 데이터와 모양을 맞추려고 이 형태를
         그대로 씁니다(끝부분이 곧 파일 경로). */
      return SB.storage.from(window.Photo.BUCKET).getPublicUrl(path).data.publicUrl;
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

    async saveClutch(row) {
      if (!USER) throw new Error('로그인이 필요합니다.');
      const payload = {};
      ['pairing', 'laid_date', 'temp', 'expected_hatch', 'egg_count', 'note', 'species'].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(row || {}, key)) payload[key] = row[key];
      });
      if (row && row.id) payload.id = row.id;
      return req(SB.rpc('save_clutch_v48', { p_row: payload }));
    },

    async saveClutchOutcome(id, outcome) {
      if (!USER) throw new Error('로그인이 필요합니다.');
      const payload = {};
      ['fertile_count', 'infertile_count', 'stopped_count', 'hatched_count',
        'actual_hatch_date', 'outcome_closed'].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(outcome || {}, key)) payload[key] = outcome[key];
      });
      return req(SB.rpc('save_clutch_outcome', { p_clutch_id: id, p_outcome: payload }));
    },

    async listClutchOffspring(clutchIds) {
      if (!USER || !Array.isArray(clutchIds) || !clutchIds.length) return [];
      return (await req(SB.rpc('my_clutch_offspring', { p_clutch_ids: clutchIds }))) || [];
    },

    async listMatingGroups(species) {
      if (!USER) return [];
      let query = SB.from('mating_groups').select('*')
        .order('updated_at', { ascending: false }).limit(100);
      if (species) query = query.eq('species', species);
      return (await req(query)) || [];
    },

    async saveMatingGroup(group, femaleIds) {
      if (!USER) throw new Error('로그인이 필요합니다.');
      const payload = {};
      ['id', 'species', 'name', 'male', 'status', 'start_date', 'end_date', 'target_morph',
        'project_id', 'project_step', 'note'].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(group || {}, key)) payload[key] = group[key];
      });
      return req(SB.rpc('save_mating_group', { p_group: payload, p_female_ids: femaleIds || [] }));
    },

    async listMatingEvents(groupIds) {
      if (!USER || !Array.isArray(groupIds) || !groupIds.length) return [];
      return (await req(SB.from('mating_events').select('*').in('group_id', groupIds)
        .order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(300))) || [];
    },

    async saveMatingEvent(event) {
      if (!USER) throw new Error('로그인이 필요합니다.');
      const payload = {};
      ['group_id', 'pairing_id', 'occurred_on', 'result', 'note'].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(event || {}, key)) payload[key] = event[key];
      });
      if (event && event.id) {
        return req(SB.from('mating_events').update(payload).eq('id', event.id).select().single());
      }
      return req(SB.from('mating_events').insert(payload).select().single());
    },

    async deleteMatingEvent(id) {
      if (!USER) throw new Error('로그인이 필요합니다.');
      return req(SB.from('mating_events').delete().eq('id', id));
    },

    async listBreedingProjects(species) {
      if (!USER) return [];
      let query = SB.from('breeding_projects').select('*')
        .order('updated_at', { ascending: false }).limit(100);
      if (species) query = query.eq('species', species);
      return (await req(query)) || [];
    },

    async createBreedingProject(project) {
      if (!USER) throw new Error('로그인이 필요합니다.');
      return req(SB.from('breeding_projects').insert({
        user_id: USER.id,
        species: project.species,
        name: project.name,
        target: project.target,
        status: project.status || 'draft'
      }).select().single());
    },

    async updateBreedingProject(project, changes) {
      if (!USER || !project || !project.id) throw new Error('로그인이 필요합니다.');
      const allowed = {};
      ['name', 'target', 'status'].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(changes || {}, key)) allowed[key] = changes[key];
      });
      let query = SB.from('breeding_projects').update(allowed).eq('id', project.id);
      if (project.updated_at) query = query.eq('updated_at', project.updated_at);
      const rows = (await req(query.select())) || [];
      if (project.updated_at && !rows.length) throw new Error('BREEDING_PROJECT_CONFLICT');
      return rows[0] || null;
    },

    async deleteBreedingProject(project) {
      if (!USER || !project || !project.id) throw new Error('로그인이 필요합니다.');
      return req(SB.from('breeding_projects').delete().eq('id', project.id));
    },

    /* ── 반복 계획 ─────────────────────────────────────────────────────── */
    async listPlans() {
      return req(SB.from('care_plans').select('*').order('created_at', { ascending: true })) || [];
    },

    async savePlan(p) {
      const row = PlanStore.row(p, CareCore.today());
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

    async routineStreak() {
      const value = await req(SB.rpc('care_routine_streak'));
      return Math.max(0, parseInt(value, 10) || 0);
    },

    async addRecord(r) {
      return req(SB.from('care_records').insert({
        animal_id: r.animal_id || null,
        plan_id: r.plan_id || null,
        kind: r.kind,
        done_date: r.done_date || CareCore.today(),
        title: r.title || null,
        detail: r.detail || null,
        note: r.note || null,
        feed_item_id: r.feed_item_id || null,
        feed_name: r.feed_name || null,
        feed_category: r.feed_category || null,
        feed_state: r.feed_state || null,
        offered_amount: r.offered_amount == null ? null : Number(r.offered_amount),
        eaten_amount: r.eaten_amount == null ? null : Number(r.eaten_amount),
        feed_unit: r.feed_unit || null,
        feeding_result: r.feeding_result || null
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
      const build = withMeasuredAt => {
        let q = SB.from('weight_logs').select('*').order('measured_on', { ascending: true });
        if (withMeasuredAt) q = q.order('measured_at', { ascending: true });
        q = q.order('created_at', { ascending: true });
        if (animalId) q = q.eq('animal_id', animalId);
        return q.limit(2000);
      };
      let response = await build(true);
      if (response.error && /measured_at|schema cache|column .* does not exist/i.test(response.error.message || '')) {
        response = await build(false);
      }
      if (response.error) throw userError(response.error);
      return response.data || [];
    },

    async saveWeight(animalId, grams, dateStr, note) {
      return req(SB.from('weight_logs').insert({
        animal_id: animalId,
        grams: grams,
        measured_on: dateStr || CareCore.today(),
        note: note || null
      }).select().single());
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
    async setShare(animalId, isPublic, note, showBreeder, rotate, listed, showWeight) {
      const args = {
        p_id: animalId,
        p_public: !!isPublic,
        p_note: note || null,
        p_breeder: !!showBreeder,
        p_rotate: !!rotate,
        p_listed: !!listed,
        p_weight: !!showWeight
      };
      const response = await SB.rpc('set_animal_share', args);
      if (response.error) throw userError(response.error);
      return response.data;
    }
  };
})();

/* 최상위 const 는 window 에 붙지 않습니다. 같은 페이지의 다른 <script> 에서
   이름만으로 부를 수는 있지만, care-ui.js 가 window.CareApp 으로 찾고 있어
   여기서 명시적으로 답니다. care-core.js 끝부분과 같은 이유입니다. */
if (typeof window !== 'undefined') window.CareApp = CareApp;
