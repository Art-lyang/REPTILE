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
   DB 가 거부하고, DB 에만 추가하면 화면에 안 뜹니다. 둘 다 고치세요.

   아이콘이 둘인 이유
     icon   화면용 Bootstrap Icons 클래스. 계산기가 쓰는 것과 같은 아이콘
            묶음이라 글자와 같은 굵기로 붙습니다.
     emoji  캘린더 파일(.ics)용. 캘린더 앱에는 우리 아이콘 폰트가 없어서
            클래스 이름을 넣으면 글자 그대로 나옵니다. */
const CARE_KINDS = {
  feed:       { ko: '급여',     icon: 'bi-egg-fried',    emoji: '🍽', color: '#075a48' },
  water:      { ko: '물 교체',  icon: 'bi-droplet-half', emoji: '💧', color: '#287e80' },
  clean:      { ko: '청소',     icon: 'bi-brush',        emoji: '🧹', color: '#5c8a3a' },
  bedding:    { ko: '바닥재',   icon: 'bi-layers',       emoji: '🪵', color: '#a9682f' },
  supplement: { ko: '영양제',   icon: 'bi-capsule',      emoji: '💊', color: '#675780' },
  weigh:      { ko: '체중',     icon: 'bi-speedometer2', emoji: '⚖️', color: '#b07d15' },
  health:     { ko: '건강',     icon: 'bi-heart-pulse',  emoji: '🩺', color: '#b4402a' },
  custom:     { ko: '기타',     icon: 'bi-pin-angle',    emoji: '📌', color: '#746f64' }
};

/* 기록에만 쓰이고 계획으로는 만들지 않는 종류 (supabase_v17.sql 3장 참고)

   탈피·배변·거식은 '일정을 잡아 하는 일' 이 아니라 '일어나면 적는 일' 이라
   반복 주기를 물어볼 수 없습니다. 그래서 계획 종류에서 뺐습니다.

   거식은 급여와 별개입니다 — 줬는데 안 먹은 것과 아예 안 준 것은 다른
   이야기이고, 파충류에서는 앞의 것이 먼저 보는 신호입니다. */
const RECORD_ONLY_KINDS = {
  symptom:  { ko: '증세', icon: 'bi-clipboard-pulse', emoji: '🔍', color: '#b4402a' },
  shed:     { ko: '탈피', icon: 'bi-arrow-repeat',   emoji: '🍂', color: '#a9682f' },
  poop:     { ko: '배변', icon: 'bi-record-circle',  emoji: '💩', color: '#8a6d3b' },
  refusal:  { ko: '거식', icon: 'bi-slash-circle',   emoji: '🚫', color: '#b4402a' },
  memo:     { ko: '메모', icon: 'bi-sticky',         emoji: '📝', color: '#746f64' },
  behavior: { ko: '행동', icon: 'bi-eye',            emoji: '👀', color: '#4E7CA8' }
};

/* 개체 화면의 '빠른 기록' 버튼. 케어 앱들이 공통으로 두는, 한 번 눌러 바로
   남기는 자리입니다. 계획에 없는 일을 적으려고 폼을 여는 것이 번거로워서
   결국 안 적게 되는 것을 막습니다. */
const QUICK_KINDS = ['feed', 'water', 'poop', 'shed', 'refusal', 'clean', 'health', 'memo'];

function kindInfo(k) {
  return CARE_KINDS[k] || RECORD_ONLY_KINDS[k]
      || { ko: k, icon: 'bi-dot', emoji: '•', color: '#746f64' };
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
  /* 아이콘 폰트가 없는 곳으로 나가는 값이라 emoji 를 씁니다. icon(=bi 클래스)을
     넣으면 캘린더에 'bi-egg-fried 급여' 라고 뜹니다. */
  L.push('SUMMARY:' + icsEscape(info.emoji + ' ' + title));
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

/* 주문 안내 — 반복하지 않는 하루짜리 일정.
   UID 를 먹이 id 로 고정합니다. 소진 예상일이 바뀐 뒤 다시 내려받으면 캘린더가
   같은 일정으로 알아보고 날짜를 옮깁니다. 매번 새 UID 를 주면 옛 날짜의 안내가
   그대로 남아, 이미 산 것을 또 사라고 알리게 됩니다. */
function icsOrderEvent(order, host) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = String(order.orderOn).replace(/-/g, '');
  const title = '🛒 ' + order.name + ' 주문';
  const desc = (order.emptyOn ? order.emptyOn + ' 쯤 떨어질 것으로 보입니다.' : '')
             + (order.buyUrl ? '\n' + order.buyUrl : '');

  const L = [];
  L.push('BEGIN:VEVENT');
  L.push('UID:feed-' + order.id + '@' + (host || 'ryangstudio.com'));
  L.push('DTSTAMP:' + stamp);
  L.push('DTSTART;VALUE=DATE:' + day);
  L.push('DURATION:P1D');
  L.push('SUMMARY:' + icsEscape(title));
  if (desc) L.push('DESCRIPTION:' + icsEscape(desc));
  if (order.buyUrl) L.push('URL:' + icsEscape(order.buyUrl));
  L.push('CATEGORIES:' + icsEscape('주문'));
  L.push('BEGIN:VALARM');
  L.push('ACTION:DISPLAY');
  L.push('DESCRIPTION:' + icsEscape(title));
  L.push('TRIGGER:PT9H');
  L.push('END:VALARM');
  L.push('END:VEVENT');
  return L;
}

/* 계획 여러 개를 캘린더 파일 하나로. animalNames 는 { 개체id: 이름 }
   orders 는 주문 안내 목록 (선택) — [{id, name, orderOn, emptyOn, buyUrl}] */
function buildIcs(plans, animalNames, host, orders) {
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
  (orders || []).forEach(function (o) {
    if (!o || !o.orderOn) return;
    L = L.concat(icsOrderEvent(o, host));
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


/* =============================================================================
   먹이 · 용품
   -----------------------------------------------------------------------------
   쓰는 사람이 자기가 실제로 먹이는 것을 직접 등록합니다. 우리가 제품 목록을
   들고 있지 않습니다 — 브랜드도 유통도 계속 바뀌고, 목록을 관리하는 순간
   그게 틀린 채로 남습니다.

   여기 계산의 핵심은 하나입니다: **언제 떨어지는가.**
   그걸 알면 주문할 날을 캘린더에 넣어줄 수 있습니다.
   ============================================================================= */

const FEED_KINDS = {
  staple:     { ko: '주식',   icon: 'bi-egg-fried',   emoji: '🍽', color: '#075a48' },
  treat:      { ko: '간식',   icon: 'bi-cookie',      emoji: '🍪', color: '#b07d15' },
  special:    { ko: '특식',   icon: 'bi-stars',       emoji: '✨', color: '#a9682f' },
  supplement: { ko: '영양제', icon: 'bi-capsule',     emoji: '💊', color: '#675780' },
  substrate:  { ko: '바닥재', icon: 'bi-layers',      emoji: '🪵', color: '#5c8a3a' },
  other:      { ko: '기타',   icon: 'bi-box-seam',    emoji: '📦', color: '#746f64' }
};
function feedKindInfo(k) {
  return FEED_KINDS[k] || FEED_KINDS.other;
}

/* 이 계획이 하루 평균 몇 번 도는가.
     3일마다  → 0.333
     월·목    → 2/7 = 0.286
   주기가 규칙적이라 평균으로 환산해도 오차가 크지 않습니다. */
function planPerDay(plan) {
  if (!plan || plan.is_active === false) return 0;
  if (Array.isArray(plan.weekdays) && plan.weekdays.length) return plan.weekdays.length / 7;
  const n = parseInt(plan.interval_days, 10);
  return (n && n > 0) ? 1 / n : 0;
}

/* 먹이 하나의 소진 전망.
   plans 는 전체 계획 목록을 넘겨도 됩니다 — 이 먹이를 쓰는 것만 골라 씁니다.

   반환
     perDay      하루 평균 소비량
     daysLeft    며칠 남았는가 (소비가 없으면 null)
     emptyOn     소진 예상일
     orderOn     주문해야 하는 날 (소진일 - lead_days)
     level       ok | soon | now | out | expiring | expired
     pct         남은 비율 (amount_full 이 있을 때만)

   ⚠️ 이건 '계획대로 먹였을 때' 의 추정입니다. 실제로 얼마나 먹었는지가 아니라
      얼마나 먹이기로 했는지에서 나옵니다. 굶기거나 더 준 날은 반영되지
      않습니다. 화면에도 그렇게 적어야 합니다. */
function feedForecast(item, plans, endDate) {
  const today0 = endDate || today();
  const out = { perDay: 0, daysLeft: null, emptyOn: null, orderOn: null, level: 'ok', pct: null };
  if (!item) return out;

  const mine = (plans || []).filter(p => p.feed_item_id === item.id);
  const per = Number(item.per_use) || 0;
  out.perDay = per > 0 ? mine.reduce((s, p) => s + planPerDay(p) * per, 0) : 0;

  const left = item.amount_left == null ? null : Number(item.amount_left);
  const full = item.amount_full == null ? null : Number(item.amount_full);
  if (left != null && full > 0) out.pct = Math.max(0, Math.min(100, Math.round(left / full * 100)));

  const lead = Math.max(0, parseInt(item.lead_days, 10) || 0);

  /* 유통기한이 소진보다 먼저 오면 그쪽이 답입니다. 남았어도 못 씁니다. */
  if (item.expires_on) {
    const d = daysBetween(today0, item.expires_on);
    if (d < 0) { out.level = 'expired'; out.expiresIn = d; return out; }
    if (d <= 14) { out.level = 'expiring'; out.expiresIn = d; }
  }

  if (left != null && left <= 0) { out.level = 'out'; out.daysLeft = 0; out.emptyOn = today0; return out; }
  if (left == null || out.perDay <= 0) {
    /* 소진은 계산할 수 없지만 기한은 압니다. 기한이 있으면 그것만으로도
       언제 새로 사야 하는지 알려줄 수 있습니다. */
    if (item.expires_on) out.orderOn = addDays(item.expires_on, -lead);
    return out;
  }

  out.daysLeft = Math.floor(left / out.perDay);
  out.emptyOn = addDays(today0, out.daysLeft);

  /* 주문일은 '언제 못 쓰게 되는가' 에서 거꾸로 셉니다. 다 먹어서 없어지는 날과
     기한이 끝나는 날 중 **먼저 오는 쪽**이 그 날입니다.

     이걸 안 하면 8월 5일에 기한이 끝나는 영양제를 10월에 주문하라고 알려주게
     됩니다 — 소진일만 보고 계산하기 때문입니다. 화면에는 '기한 임박' 이라고
     떠 있는데 캘린더에는 두 달 뒤 일정이 들어가면, 둘 중 뭘 믿어야 할지
     알 수 없습니다. */
  const endOn = (item.expires_on && item.expires_on < out.emptyOn) ? item.expires_on : out.emptyOn;
  out.endOn = endOn;
  out.orderOn = addDays(endOn, -lead);

  if (out.level === 'ok') {
    const untilEnd = daysBetween(today0, endOn);
    if (untilEnd <= lead) out.level = 'now';            // 지금 주문해야 도착이 맞음
    else if (untilEnd <= lead + 7) out.level = 'soon';
  }
  return out;
}

const FEED_LEVEL = {
  ok:       { ko: '넉넉',       tone: 'good' },
  soon:     { ko: '곧 주문',    tone: 'info' },
  now:      { ko: '지금 주문',  tone: 'warn' },
  out:      { ko: '떨어짐',     tone: 'warn' },
  expiring: { ko: '기한 임박',  tone: 'warn' },
  expired:  { ko: '기한 지남',  tone: 'warn' }
};


/* =============================================================================
   증세 관찰
   -----------------------------------------------------------------------------
   ⚠️ 여기 있는 것은 전부 '무엇이 보이는가' 입니다. 원인도, 병명도, 처치도
      적지 않습니다. 그건 수의사의 영역이고, 우리가 적는 순간 사육자는 그것을
      진단으로 읽습니다. 잘못 읽으면 개체가 죽습니다.

      그래서 각 항목은 이렇게만 이루어져 있습니다.
        ko    무엇이 보이는가 (증세 이름)
        what  어디를 어떻게 보는가 (관찰 방법)
        vet   이건 기록만 하지 말고 수의사에게 보이라고 권할 것인가

      vet 는 한 방향으로만 씁니다 — '보이세요' 라고 말할 뿐, '괜찮습니다'
      라고는 하지 않습니다. 판단을 미루는 쪽으로 틀리는 편이 안전합니다.
      vet 가 false 인 항목도 걱정되면 상담하라는 문구를 화면에 함께 답니다.

   유전 관련(에니그마 신경증상·레몬 프로스트 종양 등)은 여기서 다루지 않습니다.
   그건 이미 태어나기 전에 계산기가 교배 단계에서 경고합니다
   (gecko-core.js 의 DANGER). 같은 이야기를 두 곳에 두면 한쪽만 고쳐집니다.

   species 가 null 이면 모든 종에 보여줍니다. 목록이 있으면 그 종에서만
   보여줍니다 — 크레스티드에 없는 증세를 크레스티드 화면에 늘어놓으면
   정작 봐야 할 것이 묻힙니다.
   ============================================================================= */
const SIGNS = {
  floppy_tail: { ko: '플로피테일', species: ['crested'], vet: false,
    what: '수직면에 붙어 쉴 때 꼬리가 등 쪽으로 넘어가 있는지. 같은 자세를 사진으로 남겨두면 비교하기 쉽습니다.' },
  kinked_tail: { ko: '꼬리 꺾임 · 구불거림', species: null, vet: false,
    what: '꼬리 어느 지점이 꺾이거나 구부러져 있는지. 언제부터인지 함께 적어두세요.' },
  autotomy: { ko: '자절 (꼬리 끊김)', species: null, vet: false,
    what: '끊어진 날짜와 끊긴 자리 상태. 붓거나 진물이 나면 수의사에게 보이세요.' },
  wobble: { ko: '균형 이상 · 머리 흔들림', species: null, vet: true,
    what: '걸을 때 기울거나 도는지, 머리가 흔들리는지. 언제 심해지는지(먹이 반응 시 등) 함께.' },
  stargazing: { ko: '별보기 자세', species: null, vet: true,
    what: '머리를 위나 뒤로 젖힌 자세를 유지하는지.' },
  stereotypy: { ko: '정형행동', species: null, vet: false,
    what: '유리 타기, 같은 자리 반복 왕복 등이 하루 중 언제 얼마나 이어지는지. 은신처·온도·시야를 함께 점검해 보세요.' },
  shed_stuck: { ko: '탈피 부전', species: null, vet: true,
    what: '허물이 남아 있는 자리. 특히 발가락 끝·꼬리 끝·눈 주위를 확인하세요. 발가락을 조이고 있으면 서두르는 편이 좋습니다.' },
  abscess: { ko: '부기 · 고름', species: null, vet: true,
    what: '어디가 부었는지, 색과 크기. 만지지 말고 사진으로 남기세요.' },
  mouth: { ko: '입 주변 이상', species: null, vet: true,
    what: '침·거품·부기가 있는지, 입을 다물지 못하는지.' },
  resp: { ko: '호흡 이상', species: null, vet: true,
    what: '콧구멍에 거품이 있는지, 입을 벌리고 숨 쉬는지, 숨소리가 나는지.' },
  prolapse: { ko: '탈출 (총배설강)', species: null, vet: true,
    what: '총배설강 밖으로 조직이 나와 있는지. 마르지 않게 두고 바로 상담하세요.' },
  bone: { ko: '뼈 · 사지 이상', species: null, vet: true,
    what: '턱이 물렁한지, 사지가 휘었는지, 떨림이 있는지.' },
  eye: { ko: '눈 이상', species: null, vet: true,
    what: '한쪽을 계속 감고 있는지, 분비물이나 부기가 있는지.' },
  bloat: { ko: '복부 팽만 · 배변 없음', species: null, vet: true,
    what: '배가 부풀어 있는지, 며칠째 배변 기록이 없는지.' },
  skin: { ko: '피부 이상', species: null, vet: true,
    what: '색이 변한 자리, 혹, 딱지, 진물이 있는지.' },
  appetite: { ko: '먹이 거부가 이어짐', species: null, vet: false,
    what: '며칠째인지, 먹이 종류를 바꿔도 그런지. 체중을 함께 재두면 판단에 도움이 됩니다.' }
};

/* 이 종에서 볼 항목만 */
function signsFor(species) {
  return Object.keys(SIGNS).filter(function (k) {
    const s = SIGNS[k];
    return !s.species || s.species.indexOf(species) >= 0;
  });
}

/* 증세 기록은 kind='symptom', detail=코드, title='관찰' 또는 '해소' 입니다.
   코드별로 가장 최근 기록이 '관찰' 이면 아직 보고 있는 것으로 봅니다.

   상태 칼럼을 따로 두지 않은 이유 — 상태는 기록에서 나옵니다. 칼럼으로 두면
   기록과 상태가 어긋날 수 있고, 그때 어느 쪽이 맞는지 알 수 없습니다. */
function signStatus(records, endDate) {
  const end = endDate || today();
  const by = {};
  (records || []).filter(r => r.kind === 'symptom' && r.detail).forEach(function (r) {
    const g = by[r.detail] || (by[r.detail] = { code: r.detail, first: r.done_date, last: r.done_date, n: 0, open: true });
    if (r.done_date < g.first) g.first = r.done_date;
    if (r.done_date >= g.last) { g.last = r.done_date; g.latestTitle = r.title; }
    g.n++;
  });
  return Object.keys(by).map(function (code) {
    const g = by[code];
    g.open = g.latestTitle !== '해소';
    g.days = daysBetween(g.first, end) + 1;
    g.ago = daysBetween(g.last, end);
    return g;
  }).sort((a, b) => (a.open === b.open) ? (a.last < b.last ? 1 : -1) : (a.open ? -1 : 1));
}


/* =============================================================================
   개체별 통계
   -----------------------------------------------------------------------------
   개체 하나를 오래 키우면 기록이 쌓입니다. 그걸 한 화면에서 보기 위한 계산들이
   여기 있습니다. 전부 순수 함수라 값만 넣어 확인할 수 있습니다.

   ⚠️ 여기 숫자는 '적어 넣은 기록' 을 센 것입니다. 실제로 한 것과 다를 수
      있습니다 — 했는데 안 적으면 안 한 것으로 나옵니다. 화면에도 그렇게
      적어야 하고, 이 숫자로 건강을 판단해서는 안 됩니다.
   ============================================================================= */

/* 지난 days 일 동안 계획이 몇 번 예정됐고 몇 번 해냈는가.
   오늘은 세지 않습니다 — 아직 하루가 끝나지 않았는데 '안 한 것' 으로 세면
   수행률이 매일 아침 떨어졌다가 저녁에 회복되는 이상한 값이 됩니다. */
function completionRate(plans, records, days, endDate) {
  const end = addDays(endDate || today(), -1);      // 어제까지
  const start = addDays(end, -(Math.max(1, days || 30) - 1));
  const donePairs = new Set((records || [])
    .filter(r => r.plan_id).map(r => r.plan_id + '|' + r.done_date));

  let due = 0, done = 0;
  (plans || []).filter(p => p.is_active !== false).forEach(function (p) {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (!isDueOn(p, d)) continue;
      due++;
      if (donePairs.has(p.id + '|' + d)) done++;
    }
  });
  return { due: due, done: done, rate: due ? Math.round(done / due * 100) : null, days: days || 30 };
}

/* 기록을 남긴 날이 며칠이나 이어졌는가.
   오늘 아직 안 적었으면 어제부터 셉니다. 저녁에 적는 사람의 연속이 아침마다
   끊긴 것처럼 보이면 안 됩니다. */
function streakDays(records, endDate) {
  const end = endDate || today();
  const has = new Set((records || []).map(r => r.done_date));
  let cur = has.has(end) ? end : addDays(end, -1);
  if (!has.has(cur)) return 0;
  let n = 0;
  while (has.has(cur) && n < 3650) { n++; cur = addDays(cur, -1); }
  return n;
}

/* 종류별로 마지막에 한 날과 그 뒤로 며칠 지났는가 */
function lastDoneByKind(records, endDate) {
  const end = endDate || today();
  const out = {};
  (records || []).forEach(function (r) {
    if (!out[r.kind] || out[r.kind].date < r.done_date) {
      out[r.kind] = { date: r.done_date, ago: daysBetween(r.done_date, end) };
    }
  });
  return out;
}

/* 체중 한눈에 */
function weightSummary(weights) {
  const w = (weights || []).slice().sort((a, b) => a.measured_on < b.measured_on ? -1 : 1);
  if (!w.length) return { count: 0 };
  const g = w.map(x => Number(x.grams));
  const round1 = v => Math.round(v * 10) / 10;
  return {
    count: w.length,
    latest: round1(g[g.length - 1]),
    latestOn: w[w.length - 1].measured_on,
    first: round1(g[0]),
    firstOn: w[0].measured_on,
    min: round1(Math.min.apply(null, g)),
    max: round1(Math.max.apply(null, g)),
    /* 전체 증감과 최근 30일 증감을 나눠 둡니다. 자란 개체는 전체가 크게
       늘어 있어서, 최근에 빠지고 있어도 전체만 보면 안 보입니다. */
    delta: w.length >= 2 ? round1(g[g.length - 1] - g[0]) : null,
    delta30: (function () {
      const cut = addDays(w[w.length - 1].measured_on, -30);
      const recent = w.filter(x => x.measured_on >= cut);
      return recent.length >= 2
        ? round1(Number(recent[recent.length - 1].grams) - Number(recent[0].grams))
        : null;
    })()
  };
}

/* 히트맵용 — 최근 days 일의 날짜별 기록 수. 오래된 날짜부터 */
function dailyCounts(records, days, endDate) {
  const end = endDate || today();
  const n = Math.max(1, days || 84);
  const bucket = {};
  (records || []).forEach(r => { bucket[r.done_date] = (bucket[r.done_date] || 0) + 1; });
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(end, -i);
    out.push({ date: d, count: bucket[d] || 0, weekday: weekdayOf(d) });
  }
  return out;
}

/* 나이. 해칭일이 없으면 null 입니다 — 모르는 것을 0살로 보여주면 안 됩니다. */
function ageText(hatchDate, endDate) {
  if (!hatchDate) return null;
  const d = daysBetween(hatchDate, endDate || today());
  if (d < 0) return null;
  if (d < 31) return d + '일';
  const m = Math.floor(d / 30.44);
  if (m < 12) return m + '개월';
  const y = Math.floor(m / 12), rm = m % 12;
  return y + '년' + (rm ? ' ' + rm + '개월' : '');
}


/* ── 밖에서 쓰도록 내보내기 ─────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.CareCore = {
    SERVICE_ID, CARE_KINDS, RECORD_ONLY_KINDS, QUICK_KINDS, SPECIES, WEEKDAY_KO, SAFETY_NOTE,
    kindInfo, ymd, parseYmd, today, addDays, daysBetween, weekdayOf,
    isDueOn, lastDueBefore, nextDueAfter, planStatus, cycleLabel,
    buildIcs, icsEscape, icsFold, weeklySummary,
    completionRate, streakDays, lastDoneByKind, weightSummary, dailyCounts, ageText,
    SIGNS, signsFor, signStatus,
    FEED_KINDS, FEED_LEVEL, feedKindInfo, planPerDay, feedForecast
  };
}
