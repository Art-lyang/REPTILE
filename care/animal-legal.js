/* =============================================================================
   법적 지위와 서류 (CITES)
   -----------------------------------------------------------------------------
   supabase_v64.sql 이 DB 쪽을 다 만들어 두었는데 화면이 없었습니다. 그래서
   legal_status 를 고를 자리조차 없었고, 서류를 올릴 방법도 없었습니다.

   서버가 이미 정한 것들을 여기서 다시 판단하지 않습니다. my_animal_legal 이
   'docs_required · docs_ok · locked' 를 계산해서 주므로 그대로 그립니다.
   화면이 따로 세면 서버와 어긋나고, 어긋난 쪽이 늘 화면입니다.

   ⚠️ 강등은 되돌릴 수 없습니다.
      한 번 CITES 로 표시하면 animal_legal_locks 에 잠금이 걸리고, 일반으로
      되돌리는 것은 관리자만 할 수 있습니다(admin_release_legal_lock). 고르기
      전에 그 사실을 알려야 합니다 — 누른 뒤에 알려주면 늦습니다.

   ⚠️ 서류 파일은 비공개 버킷에 들어갑니다.
      상대방 이름·주소·허가번호가 들어 있어서 공개 주소가 있으면 안 됩니다.
      경로 형식은 서버 CHECK 가 강제합니다 — 'd/u_<소유자uuid>_<파일명>'.
   ============================================================================= */
(function (global) {
  'use strict';

  const BUCKET = 'animal-documents';

  /* 잠금을 푸는 핵심 서류. 보조 서류는 보관은 되지만 잠금을 못 풉니다
     (supabase_v64.sql 의 cites_docs_ok 와 같은 목록이어야 합니다). */
  const CORE_KINDS = ['cites_import', 'cites_export', 'cites_reexport',
    'cites_certificate', 'artificial_propagation'];
  const EXTRA_KINDS = ['import_declaration', 'transfer_report', 'purchase_contract', 'other'];
  const ALL_KINDS = CORE_KINDS.concat(EXTRA_KINDS);

  const STATUSES = ['none', 'unknown', 'cites_i', 'cites_ii', 'cites_iii', 'domestic_regulated'];

  function isCites(status) {
    return ['cites_i', 'cites_ii', 'cites_iii'].indexOf(status) >= 0;
  }

  /* 파일 이름을 서버 CHECK 가 받는 모양으로 다듬습니다. 한글 파일명이 그대로
     올라가면 정규식에 걸려 저장이 거절되는데, 그 이유가 화면에는 안 보입니다. */
  function safeName(name) {
    const dot = String(name || '').lastIndexOf('.');
    const ext = dot > 0 ? String(name).slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) : 'bin';
    const stem = String(Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    return stem + '.' + (ext || 'bin');
  }

  function pathFor(userId, fileName) {
    return 'd/u_' + userId + '_' + safeName(fileName);
  }

  async function upload(sb, userId, file) {
    const path = pathFor(userId, file && file.name);
    const res = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (res.error) throw res.error;
    return path;
  }

  /* 서명 주소. 비공개 버킷이라 그냥 주소로는 안 열립니다. */
  async function signedUrl(sb, path, seconds) {
    const res = await sb.storage.from(BUCKET).createSignedUrl(path, seconds || 120);
    if (res.error) throw res.error;
    return res.data && res.data.signedUrl;
  }

  global.AnimalLegal = {
    BUCKET: BUCKET,
    CORE_KINDS: CORE_KINDS,
    EXTRA_KINDS: EXTRA_KINDS,
    ALL_KINDS: ALL_KINDS,
    STATUSES: STATUSES,
    isCites: isCites,
    safeName: safeName,
    pathFor: pathFor,
    upload: upload,
    signedUrl: signedUrl,

    load: function (sb, animalId) {
      return sb.rpc('my_animal_legal', { p_animal: animalId }).then(function (r) {
        if (r.error) throw r.error;
        return r.data;
      });
    },

    saveDocument: function (sb, doc) {
      return sb.rpc('save_animal_document', { p_doc: doc }).then(function (r) {
        if (r.error) throw r.error;
        return r.data;
      });
    },

    archiveDocument: function (sb, id) {
      return sb.rpc('archive_animal_document', { p_id: id }).then(function (r) {
        if (r.error) throw r.error;
        return r.data;
      });
    }
  };
}(window));
