/* =============================================================================
   케어 — 순수 로직
   -----------------------------------------------------------------------------
   화면도 서버도 건드리지 않는 함수만 둡니다. 반복 주기 계산, 캘린더 파일
   만들기, 주간 요약이 여기 있습니다. 이 파일만 따로 열어 값을 넣어보면
   맞는지 확인할 수 있습니다.

   종을 가리지 않습니다. 레오파드든 피그미다람쥐든 '3일마다 급여' 의 계산은
   같습니다. 다른 것은 기본값뿐이라 SPECIES 표로 빼두었습니다.
   ============================================================================= */

const SERVICE_ID = 'care';

/* ── 케어 종류 ────────────────────────────────────────────────────────────
   supabase_v16.sql 의 kind 제약과 같아야 합니다. 여기에만 추가하면 저장할 때
   DB 가 거부하고, DB 에만 추가하면 화면에 안 뜹니다. 둘 다 고치세요. */
const CARE_KINDS = {
  feed:       { ko: '급여',     icon: '🍽', color: '#0E7C7B' },
  water:      { ko: '물 교체',  icon: '💧', color: '#3B8DA0' },
  clean:      { ko: '청소',     icon: '🧹', color: '#7FA653' },
  bedding:    { ko: '바닥재',   icon: '🪵', color: '#C67B4A' },
  supplement: { ko: '영양제',   icon: '💊', color: '#6B5686' },
  weigh:      { ko: '체중',     icon: '⚖️', color: '#EAC36A' },
  health:     { ko: '건강',     icon: '🩺', color: '#B4402A' },
  custom:     { ko: '기타',     icon: '📌', color: '#8A8375' }
};

/* 기록에만 쓰이고 계획으로는 만들지 않는 종류 (v16 의 care_records 제약 참고) */
const RECORD_ONLY_KINDS = {
  memo:     { ko: '메모',   icon: '📝', color: '#8A8375' },
  behavior: { ko: '행동',   icon: '👀', color: '#4E7CA8' }
};

function kindInfo(k) {
  return CARE_KINDS[k] || RECORD_ONLY_KINDS[k] || { ko: k, icon: '•', color: '#8A8375' };
}

/* ── 종별 기본 계획 ───────────────────────────────────────────────────────
   ⚠️ 이건 '자주 쓰이는 출발점' 이지 사육 지침이 아닙니다. 개체의 나이·크기·
      계절·건강 상태에 따라 달라지고, 그 판단은 사육자가 합니다. 화면에도
      같은 취지를 적어두었습니다.

   DB 에 두지 않고 코드에 둡니다. 관리자 화면에서 고칠 일이 거의 없고, 표를
   하나 더 만들면 그 표가 비었을 때 무엇을 보여줄지부터 정해야 합니다.
   나중에 필요해지면 그때 옮기면 됩니다.

   새 종을 추가할 때는 여기에 한 덩어리만 더하면 됩니다. 화면·저장·캘린더는
   손댈 것이 없습니다. */
const SPECIES = {
  leopard: {
    ko: '레오파드 게코', icon: '🦎', calc: '/gecko/',
    weightRange: [8, 120],
    plans: [
      { kind: 'feed',       title: '급여',          interval_days: 3, detail: '성체 기준. 유체는 매일' },
      { kind: 'supplement', title: '칼슘 더스팅',    weekdays: [1, 4] },
      { kind: 'supplement', title: '비타민',        weekdays: [0] },
      { kind: 'water',      title: '물 교체',        interval_days: 1 },
      { kind: 'clean',      title: '스팟 청소',      interval_days: 1 },
      { kind: 'clean',      title: '전체 청소',      interval_days: 30 },
      { kind: 'weigh',      title: '체중 측정',      weekdays: [6] }
    ]
  },
  crested: {
    ko: '크레스티드 게코', icon: '🦎', calc: '/crested/',
    weightRange: [2, 90],
    plans: [
      { kind: 'feed',       title: 'CGD 급여',       interval_days: 2 },
      { kind: 'feed',       title: '곤충 급여',      weekdays: [3] },
      { kind: 'supplement', title: '칼슘 더스팅',    weekdays: [3] },
      { kind: 'water',      title: '분무 · 물 교체', interval_days: 1 },
      { kind: 'clean',      title: '스팟 청소',      interval_days: 1 },
      { kind: 'clean',      title: '전체 청소',      interval_days: 30 },
      { kind: 'weigh',      title: '체중 측정',      weekdays: [6] }
    ]
  },
  fattail: {
    ko: '아프리카 팻테일 게코', icon: '🦎', calc: '/fattail/',
    weightRange: [8, 120],
    plans: [
      { kind: 'feed',       title: '급여',          interval_days: 3 },
      { kind: 'supplement', title: '칼슘 더스팅',    weekdays: [1, 4] },
      { kind: 'supplement', title: '비타민',        weekdays: [0] },
      { kind: 'water',      title: '물 교체',        interval_days: 1 },
      { kind: 'clean',      title: '스팟 청소',      interval_days: 1 },
      { kind: 'clean',      title: '전체 청소',      interval_days: 30 },
      { kind: 'weigh',      title: '체중 측정',      weekdays: [6] }
    ]
  },
  /* 피그미다람쥐는 포유류라 주기가 확연히 다릅니다. 매일 먹고, 물이 마르면
     안 되고, 바닥재를 자주 갈아야 합니다. 같은 화면에 같은 구조로 담기지만
     기본값은 이렇게 갈라집니다. */
  pygmy: {
    ko: '피그미다람쥐', icon: '🐿', calc: null,
    weightRange: [20, 400],
    plans: [
      { kind: 'feed',       title: '급여',          interval_days: 1 },
      { kind: 'feed',       title: '간식 · 견과',    weekdays: [2, 5] },
      { kind: 'water',      title: '물 교체',        interval_days: 1 },
      { kind: 'clean',      title: '스팟 청소',      interval_days: 1 },
      { kind: 'bedding',    title: '바닥재 교체',    weekdays: [6] },
      { kind: 'clean',      title: '전체 청소',      interval_days: 14 },
      { kind: 'weigh',      title: '체중 측정',      weekdays: [6] }
    ]
  },
  other: {
    ko: '기타', icon: '🐾', calc: null,
    weightRange: [1, 5000],
    plans: [
      { kind: 'feed',  title: '급여',    interval_days: 1 },
      { kind: 'water', title: '물 교체', interval_days: 1 },
      { kind: 'clean', title: '청소',    interval_days: 7 },
      { kind: 'weigh', title: '체중 측정', weekdays: [6] }
    ]
  }
};

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];


/* =============================================================================
   날짜
   -----------------------------------------------------------------------------
   전부 'YYYY-MM-DD' 문자열로 주고받습니다. Date 객체를 돌려쓰면 시간대 때문에
   하루씩 밀리는 사고가 납니다 — new Date('2026-07-29') 는 UTC 자정으로 읽혀서
   한국에서 getDate() 를 부르면 29일이 나오지만, 서머타임을 쓰는 지역에서는
   28일이 나옵니다. 그래서 파싱할 때 항상 '현지 자정' 으로 못 박습니다.
   ============================================================================= */

function ymd(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

/* 'YYYY-MM-DD' → 현지 자정 Date. 위에 적은 이유로 new Date(s) 를 쓰지 않습니다. */
function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function today() { return ymd(new Date()); }

function addDays(s, n) {
  const d = parseYmd(s);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/* 두 날짜 사이의 일수. 시각이 아니라 '날' 단위라 서머타임에 영향받지 않게
   자정끼리 뺀 뒤 반올림합니다. */
function daysBetween(a, b) {
  const da = parseYmd(a), db = parseYmd(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000);
}

function weekdayOf(s) {
  const d = parseYmd(s);
  return d ? d.getDay() : null;
}


/* =============================================================================
   반복 주기
   -----------------------------------------------------------------------------
   기준을 '시작일' 로 잡습니다. '마지막으로 한 날' 을 기준으로 잡는 방법도
   있지만(늦게 하면 다음도 밀리는 방식), 그렇게 하면 캘린더에 넣은 일정과
   앱이 보여주는 날짜가 갈라집니다. 캘린더는 "3일마다" 를 고정된 날짜로만
   표현할 수 있고, "네가 마지막에 한 날로부터 3일 뒤" 는 표현할 수 없습니다.

   두 곳이 다른 날을 가리키면 사용자는 어느 쪽을 믿어야 할지 모릅니다.
   그래서 날짜는 시작일 기준으로 고정하고, 밀린 것은 따로 '밀림' 으로
   표시합니다.
   ============================================================================= */

/* 이 계획이 그날 예정돼 있는가 */
function isDueOn(plan, dateStr) {
  if (!plan || plan.is_active === false) return false;
  const start = plan.start_date || '1970-01-01';
  if (dateStr < start) return false;

  if (Array.isArray(plan.weekdays) && plan.weekdays.length) {
    return plan.weekdays.indexOf(weekdayOf(dateStr)) >= 0;
  }
  const n = parseInt(plan.interval_days, 10);
  if (!n || n < 1) return false;
  const gap = daysBetween(start, dateStr);
  return gap >= 0 && gap % n === 0;
}

/* 그날 이전(그날 포함)의 마지막 예정일. 없으면 null.
   360일까지만 되짚습니다 — 그보다 오래 안 한 것은 '밀림' 을 세는 의미가
   없고, 무한 반복으로 화면이 멈추는 것을 막습니다. */
function lastDueBefore(plan, dateStr) {
  for (let i = 0; i <= 360; i++) {
    const d = addDays(dateStr, -i);
    if (d < (plan.start_date || '1970-01-01')) return null;
    if (isDueOn(plan, d)) return d;
  }
  return null;
}

/* 그날 이후(그날 제외)의 다음 예정일 */
function nextDueAfter(plan, dateStr) {
  for (let i = 1; i <= 400; i++) {
    const d = addDays(dateStr, i);
    if (isDueOn(plan, d)) return d;
  }
  return null;
}

/* 계획 하나의 오늘 상태.
     due       오늘 예정인가
     done      오늘 몫을 끝냈는가
     overdue   며칠 밀렸는가 (0 이면 안 밀림)
     next      다음 예정일 */
function planStatus(plan, dateStr, doneDates) {
  const day = dateStr || today();
  const done = new Set(doneDates || []);
  const due = isDueOn(plan, day);

  let overdue = 0;
  const last = lastDueBefore(plan, day);
  if (last && !done.has(last)) {
    /* 마지막 예정일을 건너뛴 경우. 오늘이 예정일이면 아직 밀린 게 아닙니다. */
    overdue = (last === day) ? 0 : daysBetween(last, day);
  }

  return {
    due: due,
    done: done.has(day),
    overdue: overdue,
    next: due ? day : nextDueAfter(plan, day)
  };
}

/* 사람이 읽는 주기 설명 */
function cycleLabel(plan) {
  if (Array.isArray(plan.weekdays) && plan.weekdays.length) {
    const sorted = plan.weekdays.slice().sort((a, b) => a - b);
    if (sorted.length === 7) return '매일';
    return sorted.map(d => WEEKDAY_KO[d]).join('·') + '요일';
  }
  const n = parseInt(plan.interval_days, 10);
  if (n === 1) return '매일';
  if (n === 7) return '주 1회';
  if (n === 30) return '30일마다';
  return n + '일마다';
}


/* =============================================================================
   캘린더 파일 (.ics)
   -----------------------------------------------------------------------------
   RFC 5545. 이 파일 하나를 폰에서 열면 구글·애플·삼성 캘린더 어디든 들어가고,
   그 뒤로는 캘린더가 알아서 반복시키며 알림을 울립니다. 우리 쪽에 알림을
   보내는 서버가 필요 없는 이유가 이것입니다.

   시간대를 붙이지 않습니다. TZID 없이 적은 시각은 '떠 있는 시간(floating)'
   이라, 보는 사람의 현지 시각으로 해석됩니다. 매일 아침 9시에 밥 주는 일에는
   그게 맞습니다 — 여행을 가도 그곳 아침 9시에 울려야지, 한국 시각 9시에
   울리면 곤란합니다. 덕분에 VTIMEZONE 덩어리도 넣지 않아도 됩니다.
   ============================================================================= */

/* TEXT 값 안의 특수문자. 이걸 안 하면 먹이 이름에 쉼표 하나만 들어가도
   그 줄부터 캘린더가 잘못 읽습니다. */
function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/* 한 줄은 75옥텟까지. 넘으면 다음 줄 앞에 공백 하나를 두고 이어 씁니다.
   한글은 UTF-8 로 3바이트라 26자쯤에서 걸립니다. 글자 중간에서 자르면
   깨지므로 코드포인트 단위로 세어 나눕니다. */
function icsFold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    /* 이어지는 줄은 앞의 공백 1옥텟을 포함해 75 */
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function icsRrule(plan) {
  if (Array.isArray(plan.weekdays) && plan.weekdays.length) {
    const NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const days = plan.weekdays.slice().sort((a, b) => a - b).map(d => NAMES[d]).join(',');
    return 'FREQ=WEEKLY;BYDAY=' + days;
  }
  const n = parseInt(plan.interval_days, 10) || 1;
  return 'FREQ=DAILY;INTERVAL=' + n;
}

/* UID 는 계획 id 로 고정합니다. 같은 계획을 두 번 내려받아도 캘린더가 같은
   일정으로 알아보고 덮어씁니다. 매번 새 값을 넣으면 중복 일정이 쌓입니다. */
function icsEvent(plan, animalName, host) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = (plan.start_date || today()).replace(/-/g, '');
  const info = kindInfo(plan.kind);
  const title = (plan.title || info.ko) + (animalName ? ' · ' + animalName : '');

  const L = [];
  L.push('BEGIN:VEVENT');
  L.push('UID:care-' + plan.id + '@' + (host || 'ryangstudio.com'));
  L.push('DTSTAMP:' + stamp);

  if (plan.time_of_day) {
    const t = String(plan.time_of_day).slice(0, 5).replace(':', '') + '00';
    L.push('DTSTART:' + start + 'T' + t);
    L.push('DURATION:PT15M');
  } else {
    L.push('DTSTART;VALUE=DATE:' + start);
    L.push('DURATION:P1D');
  }

  L.push('RRULE:' + icsRrule(plan));
  L.push('SUMMARY:' + icsEscape(info.icon + ' ' + title));
  if (plan.detail) L.push('DESCRIPTION:' + icsEscape(plan.detail));
  L.push('CATEGORIES:' + icsEscape(info.ko));

  /* 알림. 시각이 정해진 일정은 정각에, 종일 일정은 그날 아침 9시에 울립니다.
     (종일 일정의 DTSTART 는 자정이라 PT9H 가 곧 아침 9시입니다) */
  L.push('BEGIN:VALARM');
  L.push('ACTION:DISPLAY');
  L.push('DESCRIPTION:' + icsEscape(title));
  L.push('TRIGGER:' + (plan.time_of_day ? '-PT0M' : 'PT9H'));
  L.push('END:VALARM');
  L.push('END:VEVENT');
  return L;
}

/* 계획 여러 개를 캘린더 파일 하나로. animalNames 는 { 개체id: 이름 } */
function buildIcs(plans, animalNames, host) {
  const names = animalNames || {};
  let L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ryangstudio//care//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape('사육 케어')
  ];
  (plans || []).forEach(function (p) {
    if (p.is_active === false) return;
    L = L.concat(icsEvent(p, p.animal_id ? names[p.animal_id] : null, host));
  });
  L.push('END:VCALENDAR');
  /* 규격이 CRLF 를 요구합니다. LF 만 쓰면 읽는 앱에 따라 통째로 실패합니다. */
  return L.map(icsFold).join('\r\n') + '\r\n';
}


/* =============================================================================
   주간 요약
   -----------------------------------------------------------------------------
   기록을 세어 보여주고, 눈에 띄는 것만 한 줄로 짚습니다.

   ⚠️ 진단하지 않습니다. 병명·치료·투약을 말하지 않고, '반드시·확실히' 같은
      단정도 쓰지 않습니다. 기록이 적을 때 겁주지 않습니다. 우리는 사용자가
      적어 넣은 것만 알고 있고, 그것으로 알 수 있는 것은 "적혀 있지 않다"
      까지입니다. 그 선을 넘는 순간 이 기능은 없느니만 못해집니다.

      문구를 고칠 때 이 원칙을 함께 지켜 주세요. (피그미 케어 기획의
      AI_REPORT_POLICY.md 에서 가져온 규칙입니다)
   ============================================================================= */

const SAFETY_NOTE =
  '이 요약은 직접 적어 넣은 기록만으로 만든 관리 참고용입니다. ' +
  '이상 증상이 이어지거나 건강이 걱정되면 수의사와 상담하세요.';

/* records: [{kind, done_date}]
   weights: [{measured_on, grams}]
            빈 배열 = "쟀는데 기록이 없음" → 체중 관련 안내를 합니다.
            null    = "체중을 볼 수 없는 화면" → 체중 이야기를 아예 꺼내지
                      않습니다. 여러 마리를 한꺼번에 보는 화면에서는 어느
                      개체의 체중인지 정할 수 없는데, 그때 '기록이 없다'고
                      말하면 실제로는 매주 재고 있는 사람에게 없는 문제를
                      알리는 셈이 됩니다. */
function weeklySummary(records, weights, endDate) {
  const end = endDate || today();
  const start = addDays(end, -6);
  const inRange = d => d >= start && d <= end;
  const weightAware = weights != null;

  const rs = (records || []).filter(r => inRange(r.done_date));
  const ws = (weights || []).filter(w => inRange(w.measured_on))
                            .sort((a, b) => a.measured_on < b.measured_on ? -1 : 1);

  const count = k => rs.filter(r => r.kind === k).length;
  const feed = count('feed'), water = count('water');
  const clean = count('clean'), supp = count('supplement');

  /* 체중 증감은 2회 이상 쟀을 때만 말합니다. 한 번 잰 값으로는 늘었는지
     줄었는지 알 수 없습니다. */
  const delta = ws.length >= 2
    ? Math.round((Number(ws[ws.length - 1].grams) - Number(ws[0].grams)) * 10) / 10
    : null;

  /* 전체 기간에서 마지막으로 한 날 (7일 밖도 봅니다) */
  const lastOf = k => {
    const hit = (records || []).filter(r => r.kind === k).map(r => r.done_date).sort();
    return hit.length ? hit[hit.length - 1] : null;
  };
  const lastWeigh = (weights || []).map(w => w.measured_on).sort().pop() || null;

  const notes = [];
  const total = rs.length;

  if (total === 0 && ws.length === 0) {
    notes.push({ level: 'info', text: '이번 주에는 기록이 없습니다. 오늘 상태를 한 줄만 남겨두면 다음 주에 비교할 수 있습니다.' });
  } else {
    if (weightAware && delta != null && delta < -1) {
      notes.push({ level: 'warn', text: '체중이 ' + Math.abs(delta) + 'g 줄었습니다. 급여량과 활동 상태를 함께 확인해 보세요.' });
    }
    if (weightAware && (!lastWeigh || daysBetween(lastWeigh, end) >= 10)) {
      notes.push({ level: 'info', text: '체중 기록이 뜸합니다. 주 1회 정도 재두면 변화를 알아보기 쉽습니다.' });
    }
    if (feed === 0) {
      notes.push({ level: 'warn', text: '이번 주 급여 기록이 없습니다. 실제로 걸렀는지, 적는 것만 걸렀는지 확인해 보세요.' });
    }
    const lastWater = lastOf('water');
    if (!lastWater || daysBetween(lastWater, end) >= 2) {
      notes.push({ level: 'info', text: '물 교체 기록이 이틀 넘게 없습니다. 신선한 물이 있는지 확인해 보세요.' });
    }
    const lastClean = lastOf('clean');
    if (!lastClean || daysBetween(lastClean, end) >= 10) {
      notes.push({ level: 'info', text: '청소 기록이 열흘 넘게 없습니다. 청소 주기를 점검해 보세요.' });
    }
    if (notes.length === 0) {
      notes.push({ level: 'good', text: '이번 주 기록이 고르게 남아 있습니다.' });
    }
  }

  return {
    start: start, end: end,
    feed: feed, water: water, clean: clean, supplement: supp,
    total: total,
    weighIns: ws.length,
    weightDelta: delta,
    notes: notes
  };
}


/* ── 밖에서 쓰도록 내보내기 ─────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.CareCore = {
    SERVICE_ID, CARE_KINDS, RECORD_ONLY_KINDS, SPECIES, WEEKDAY_KO, SAFETY_NOTE,
    kindInfo, ymd, parseYmd, today, addDays, daysBetween, weekdayOf,
    isDueOn, lastDueBefore, nextDueAfter, planStatus, cycleLabel,
    buildIcs, icsEscape, icsFold, weeklySummary
  };
}
