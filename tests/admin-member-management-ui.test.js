const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Given the owner member tab, when it renders, then it uses the maintainable member management module', () => {
  const page = read('admin/index.html');
  const ui = read('admin/admin-members.js');
  const actions = read('admin/admin-member-actions.js');

  assert.match(page, /admin-members\.css\?v=/);
  assert.match(page, /admin-members-i18n\.js\?v=/);
  assert.match(page, /admin-member-actions\.js\?v=/);
  assert.match(page, /admin-members\.js\?v=/);
  assert.match(page, /AdminMembers\.render/);
  assert.match(ui, /admin_list_members/);
  assert.match(actions, /\/api\/admin\/members\/action/);
  assert.match(actions, /Authorization[^\n]+Bearer/);
  assert.doesNotMatch(`${ui}\n${actions}`, /service[_-]?role|SUPABASE_SECRET_KEY|server-secret/i);
});

test('Given member administration, when dangerous actions are shown, then reasons and explicit delete confirmation are required', () => {
  const ui = read('admin/admin-members.js');

  assert.match(ui, /reason[^\n]+required/i);
  assert.match(ui, /confirmEmail/);
  assert.match(ui, /member\.email/);
  assert.match(ui, /member\.is_admin/);
  assert.match(ui, /member\.user_id\s*===\s*state\.adminUser\.id/);
});

test('Given premium access is granted, when the owner opens the action dialog, then grant type and bounded duration are explicit', () => {
  const ui = read('admin/admin-members.js');
  const actions = read('admin/admin-member-actions.js');

  assert.match(ui, /name="grantType"/);
  assert.match(ui, /value="trial"/);
  assert.match(ui, /value="timed"/);
  assert.match(ui, /value="permanent"/);
  assert.match(ui, /name="durationDays"[^>]+min="1"[^>]+max="3650"/);
  assert.match(actions, /grantType:[^,]+,\s*durationDays:/);
  assert.match(actions, /expectedExpiry/);
  assert.match(actions, /refreshSession/);
  assert.match(actions, /ADMIN_SESSION_(?:TOKEN_INVALID|VERIFY_FAILED)/);
});

test('Given the admin member UI supports I18n, when dictionaries are parsed, then all supported locales have equal keys', () => {
  const ui = read('admin/admin-members-i18n.js');
  for (const locale of ['ko', 'en', 'zh', 'ja']) {
    assert.match(ui, new RegExp(`${locale}:\\s*\\{`));
  }
  assert.match(ui, /SUPPORTED\s*=\s*\['ko',\s*'en',\s*'zh',\s*'ja'\]/);
  assert.match(ui, /assertDictionaryParity/);
});

test('Given Cloudflare serves privileged routes, when deployed, then admin APIs run through the Worker first', () => {
  const config = read('wrangler.jsonc');

  assert.match(config, /"run_worker_first"\s*:\s*\[[\s\S]*?"\/api\/billing\/\*"[\s\S]*?"\/api\/admin\/\*"/);
  assert.match(config, /"SUPABASE_PUBLISHABLE_KEY"\s*:\s*"sb_publishable_/);
});
