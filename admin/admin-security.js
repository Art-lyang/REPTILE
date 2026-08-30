/* =============================================================================
   관리자 · 보안 탭
   -----------------------------------------------------------------------------
   여기 보이는 것은 Worker 가 실제로 받은 요청입니다. 관리자 API 를 찾아다니거나
   아직 열지 않은 결제 경로를 두드린 흔적을 supabase_v53.sql 의 security_events
   에 남기고, 그것을 그대로 보여 줍니다.

   Cloudflare 가 막은 위협 수는 여기에 없습니다. 무료 플랜은 '몇 건 막았다' 는
   숫자만 주고 무엇이었는지는 주지 않아서, 봐도 할 수 있는 일이 없습니다.
   (Pro 플랜부터 firewallEventsAdaptive 로 상세가 열립니다)

   index.html 에서 부릅니다:
     window.AdminSecurity.render({ SB, body, esc })
   ============================================================================= */
(function () {
  'use strict';

  const KIND = {
    admin_probe: '관리자 경로 탐색',
    admin_auth_fail: '관리자 인증 실패',
    billing_probe: '결제 경로 접근',
    other: '기타',
  };

  function when(value) {
    try {
      return new Date(value).toLocaleString('ko-KR',
        { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '-'; }
  }

  /* 최근 14일 자리를 미리 만들어 둡니다. 값이 0 인 날도 칸을 남겨야
     '조용한 날' 과 '기록이 아예 없는 구간' 이 구분됩니다.
     날짜 키는 한국 시간 기준입니다 — security_events 는 UTC 로 쌓이고
     admin_security_summary 가 Asia/Seoul 로 바꿔서 돌려줍니다. */
  function lastDays(count, byDay, now) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const t = new Date(now - i * 86400000);
      const key = new Date(t.getTime() + 9 * 3600000).toISOString().slice(0, 10);
      out.push([key, byDay[key] || 0]);
    }
    return out;
  }

  function bars(days, esc) {
    const peak = Math.max(1, ...days.map(d => d[1]));
    return '<div class="secbars">' + days.map(function (d) {
      return '<div class="secbar" title="' + esc(d[0]) + ' · ' + d[1] + '건">'
        + '<div class="secbarfill" style="height:' + Math.round(d[1] / peak * 100) + '%"></div>'
        + '<span>' + esc(d[0].slice(8)) + '</span></div>';
    }).join('') + '</div>';
  }

  function table(head, rows) {
    return '<div class="atblwrap"><table class="atbl"><thead><tr>'
      + head.map(h => '<th>' + h + '</th>').join('')
      + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  async function render(options) {
    const SB = options.SB, body = options.body, esc = options.esc;
    const now = options.now || Date.now();
    body.innerHTML = '<div class="asub">불러오는 중…</div>';

    const results = await Promise.all([
      SB.rpc('admin_security_summary', { p_days: 14 }),
      SB.rpc('admin_security_events', { p_days: 7, p_limit: 200 }),
      SB.rpc('admin_audit_log', { p_limit: 100 }),
    ]);
    const summary = results[0], events = results[1], audit = results[2];

    /* 마이그레이션 전이면 함수 자체가 없습니다. 빈 화면 대신 할 일을 알려 줍니다. */
    const missing = results.some(r => r.error
      && /schema cache|does not exist|PGRST202/i.test(r.error.message || r.error.code || ''));
    if (missing) {
      body.innerHTML = '<div class="aerr"><b>보안 기록 표가 아직 없습니다.</b><br><br>'
        + '<code>supabase_v53.sql</code> 을 Supabase SQL Editor 에 적용하세요.<br>'
        + '적용 전까지는 Worker 가 시도를 기록하지 않습니다.</div>';
      return;
    }
    /* 함수가 is_admin() 으로 막으면 null 이 옵니다. */
    if (summary.data === null || events.data === null) {
      body.innerHTML = '<div class="aerr"><b>이 화면을 볼 권한이 없습니다.</b></div>';
      return;
    }

    const rows = events.data || [], daily = summary.data || [], log = audit.data || [];
    const card = (n, l, sub) => '<div class="statcard"><div class="statn">' + n + '</div>'
      + '<div class="statl">' + l + '</div>'
      + (sub ? '<div class="statx">' + sub + '</div>' : '') + '</div>';
    const count = k => rows.filter(r => r.kind === k).length;

    let html = '<div class="ahint">Worker 가 받은 <b>실제 시도</b>입니다. 같은 곳에서 계속 '
      + '두드려도 1분에 한 줄로 묶어 기록합니다. 90일이 지난 기록은 정리됩니다.</div>';

    html += '<div class="alabel2">🛡️ 최근 7일</div><div class="statrow">'
      + card(rows.length, '전체 시도')
      + card(count('admin_probe'), '관리자 경로 탐색')
      + card(count('admin_auth_fail'), '관리자 인증 실패')
      + card(count('billing_probe'), '결제 경로 접근')
      + '</div>';

    const byDay = {};
    daily.forEach(d => { byDay[d.day] = (byDay[d.day] || 0) + Number(d.n || 0); });
    html += '<div class="alabel2">📈 최근 14일 추이</div>' + bars(lastDays(14, byDay, now), esc);

    html += '<div class="alabel2">🔎 최근 시도 (7일 · 최대 200건)</div>';
    html += rows.length
      ? table(['시각', '종류', '경로', 'IP', '국가', 'User-Agent'], rows.map(r =>
        '<tr><td>' + esc(when(r.ts)) + '</td>'
        + '<td>' + esc(KIND[r.kind] || r.kind) + '</td>'
        + '<td><code>' + esc(r.path || '-') + '</code></td>'
        + '<td>' + esc(r.ip || '-') + '</td>'
        + '<td>' + esc(r.country || '-') + '</td>'
        + '<td class="secua">' + esc((r.ua || '-').slice(0, 70)) + '</td></tr>'))
      : '<div class="asub">기록된 시도가 없습니다. 조용하다는 뜻입니다.</div>';

    html += '<div class="alabel2">📝 관리자 조치 기록</div>'
      + '<div class="ahint">회원 등급 변경·이용 제한·탈퇴 처리가 남습니다. 누가 했는지까지 기록됩니다.</div>';
    html += log.length
      ? table(['시각', '한 사람', '대상', '조치', '결과', '사유'], log.map(a =>
        '<tr><td>' + esc(when(a.created_at)) + '</td>'
        + '<td>' + esc(a.actor_email || '-') + '</td>'
        + '<td>' + esc(a.target_email || '-') + '</td>'
        + '<td>' + esc(a.action) + '</td>'
        + '<td>' + (a.status === 'success' ? '성공' : '<b class="secfail">실패</b>') + '</td>'
        + '<td>' + esc((a.reason || '').slice(0, 60)) + '</td></tr>'))
      : '<div class="asub">아직 조치 기록이 없습니다.</div>';

    body.innerHTML = html;
  }

  window.AdminSecurity = { render: render, lastDays: lastDays };
}());
