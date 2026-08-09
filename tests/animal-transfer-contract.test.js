const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const V65 = read('supabase_v65.sql');
const V77 = read('supabase_v77.sql');
const V54 = read('supabase_v54.sql');

/* 양도는 개체가 남의 계정으로 넘어가는 일입니다. 한 번 잘못되면 되돌릴 수
   없어서, 계약이 코드로 지켜지는지 여기서 잠가 둡니다. */

test('Given save_row edits by delete and insert, when an animal was transferred, then the insert is refused', () => {
  /* v65 는 update 만 막고 있었습니다. save_row 는 cur 를 합쳐 transferred_at
     을 자동으로 실어 보내고 delete + insert 로 고치므로, 두 검사를 모두
     비껴갔습니다 — 넘긴 개체의 이름·모프를 그냥 고칠 수 있었습니다. */
  assert.match(V54, /p_row := cur \|\| p_row;/, 'save_row 가 지금 줄을 합치는 전제');
  assert.match(V54, /delete from public\.%I where id = \$1/, 'save_row 가 delete+insert 하는 전제');

  /* 머리말이 고치기 전 코드를 인용하고 있으므로 함수 본문만 봅니다. */
  const fn = V77.slice(V77.indexOf('create or replace function public.animals_transfer_guard'));
  assert.match(fn, /if tg_op = 'INSERT' then/);
  assert.match(fn, /raise exception 'TRANSFER_READONLY'/);
  /* 필드 비교가 tg_op = 'UPDATE' 안에 갇혀 있으면 안 됩니다. */
  assert.doesNotMatch(fn, /if tg_op = 'UPDATE' and \(/);
});

test('Given two people open the same link, when both accept, then only one wins', () => {
  const accept = V65.slice(V65.indexOf('function public.accept_animal_transfer'));
  assert.match(accept, /where token = p_token for update;/, '행 잠금이 있어야 합니다');
  assert.match(accept, /if tr\.status <> 'pending' then raise exception 'TRANSFER_CLOSED'/);
});

test('Given a CITES animal without paperwork, when it is transferred, then both ends check', () => {
  /* 발의할 때만 보면, 발의한 뒤 서류가 빠져도 수락이 됩니다. */
  const start = V65.slice(V65.indexOf('function public.start_animal_transfer'),
                          V65.indexOf('function public.cancel_animal_transfer'));
  const accept = V65.slice(V65.indexOf('function public.accept_animal_transfer'));
  assert.match(start, /assert_cites_transferable/);
  assert.match(accept, /assert_cites_transferable/);
});

test('Given the recipient has a full account, when they accept, then the cap still holds', () => {
  /* 정의자 권한으로 남의 계정에 줄을 넣습니다. 여기서 안 세면 상한이
     아무 뜻이 없어집니다. */
  const accept = V65.slice(V65.indexOf('function public.accept_animal_transfer'));
  assert.match(accept, /care_effective_limit\(u\)/);
  assert.match(accept, /ANIMAL_LIMIT_REACHED/);
});

test('Given the animal is copied not moved, when it lands, then the sender keeps a working record', () => {
  /* user_id 를 옮기면 그 개체를 부모로 둔 양도자의 다른 개체가 저장되지
     않습니다(save_row 가 delete 후 재insert 하므로 참조가 깨집니다). */
  const accept = V65.slice(V65.indexOf('function public.accept_animal_transfer'));
  assert.match(accept, /insert into public\.animals \(/, '사본을 새로 만들어야 합니다');
  assert.doesNotMatch(accept, /update public\.animals set user_id/, '주인을 옮기면 안 됩니다');
  /* 공개 상태와 메모는 물려주지 않습니다. */
  assert.match(accept, /pedigree_snapshot, is_public, is_listed\)/);
});

test('Given the ledger is the record, when anyone writes to it, then only the functions can', () => {
  assert.match(V65, /alter table public\.animal_transfers enable row level security;/);
  assert.match(V65, /create policy animal_transfers_select on public\.animal_transfers/);
  /* insert·update·delete 정책이 없어야 합니다 — RLS 는 정책이 없으면 막습니다. */
  assert.doesNotMatch(V65, /create policy [a-z_]+ on public\.animal_transfers\s+for (insert|update|delete)/);
  /* 개체로 향하는 cascade 가 있으면 이름만 바꿔도 이력이 날아갑니다. */
  const table = V65.slice(V65.indexOf('create table if not exists public.animal_transfers'),
                          V65.indexOf('create index if not exists animal_transfers_animal_idx'));
  assert.doesNotMatch(table, /references public\.animals/);
});

test('Given the lineage was handed over, when the sender renames an ancestor, then the copy keeps the old names', () => {
  /* 혈통서에 찍혀 나간 이름이 뒤늦게 달라지면 안 됩니다. */
  assert.match(V65, /pedigree_snapshot jsonb/);
  assert.match(V65, /private\.pedigree_snapshot\(tr\.animal_id, tr\.gens\)/);
});

test('Given one link is live, when another is made, then the first one dies', () => {
  /* QR 을 여러 장 뿌려 놓고 누가 먼저 찍는지 겨루게 두면 안 됩니다. */
  const start = V65.slice(V65.indexOf('function public.start_animal_transfer'),
                          V65.indexOf('function public.cancel_animal_transfer'));
  assert.match(start, /set status = 'cancelled', cancelled_at = now\(\)[\s\S]{0,120}status = 'pending'/);
  assert.match(start, /ALREADY_TRANSFERRED/, '한 번 넘긴 개체는 다시 못 넘깁니다');
});

test('Given an animal was handed over, when the keeper opens the edit form, then there is no form to fill', () => {
  /* 서버가 거부하지만(v77), 다 적고 저장을 눌러 보고 나서 알게 하면
     그건 안내가 아니라 함정입니다. */
  const ui = read('care/care-ui.js');

  assert.match(ui, /function transferredNotice\(a\)/);
  const form = ui.slice(ui.indexOf('function animalForm(a)'), ui.indexOf('function animalForm(a)') + 260);
  assert.match(form, /if \(a\.transferred_at\) return transferredNotice\(a\);/);
  assert.ok(form.indexOf('transferredNotice') < form.indexOf('AnimalForm.html'),
    '폼을 만들기 전에 걸러야 합니다');

  /* 목록에서도 미리 보여야 헛걸음을 안 합니다. */
  assert.match(ui, /a\.transferred_at \? '<span class="chip chip-locked">'/);

  /* 안내에서 나갈 길이 있어야 합니다 — 이 화면이 실제로 듣는 이름으로. */
  const notice = ui.slice(ui.indexOf('function transferredNotice'), ui.indexOf('function animalForm(a)'));
  assert.match(notice, /data-cancel="animal"/);
  assert.doesNotMatch(notice, /<input|<select|<textarea/);
});
