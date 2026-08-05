const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const file of ['supabase_v50.sql', 'supabase_setup.sql']) {
  test(`Given ${file}, when member management is installed, then owner-only member data is exposed through a guarded RPC`, () => {
    const sql = read(file);

    assert.match(sql, /create or replace function private\.admin_list_members\(p_actor uuid\)/i);
    assert.match(sql, /create or replace function public\.admin_list_members\(\)/i);
    assert.match(sql, /public\.is_owner_user\(p_actor\)/i);
    assert.match(sql, /from auth\.users/i);
    assert.match(sql, /from auth\.identities/i);
    assert.match(sql, /banned_until/i);
    assert.match(sql, /entitlement_key\s*=\s*'premium'/i);
    assert.match(sql, /grant execute on function public\.admin_list_members\(\) to authenticated/i);
    assert.doesNotMatch(sql, /grant execute on function public\.admin_list_members\(\) to anon/i);
  });

  test(`Given ${file}, when privileged member actions are installed, then they stay service-only and audited`, () => {
    const sql = read(file);

    assert.match(sql, /create table if not exists private\.admin_member_actions/i);
    assert.match(sql, /create or replace function private\.assert_admin_member_target/i);
    assert.match(sql, /ADMIN_MEMBER_SELF_ACTION_FORBIDDEN/i);
    assert.match(sql, /ADMIN_MEMBER_ADMIN_ACTION_FORBIDDEN/i);
    assert.match(sql, /create or replace function public\.admin_set_member_tier_service/i);
    assert.match(sql, /create or replace function public\.admin_prepare_member_deletion_service/i);
    assert.match(sql, /create or replace function public\.admin_record_member_action_service/i);
    assert.match(sql, /grant execute on function public\.admin_set_member_tier_service[\s\S]*?to service_role/i);
    assert.match(sql, /grant execute on function public\.admin_prepare_member_deletion_service[\s\S]*?to service_role/i);
    assert.match(sql, /revoke all on function public\.admin_set_member_tier_service[\s\S]*?from public, anon, authenticated/i);
    assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?private\.admin_member_actions\s+to\s+authenticated/i);
  });

  test(`Given ${file}, when a tier changes or account deletion is prepared, then premium and owned data are handled without deleting auth directly`, () => {
    const sql = read(file);

    assert.match(sql, /source_type\s*=\s*'admin'/i);
    assert.match(sql, /entitlement_key\s*=\s*'premium'/i);
    assert.match(sql, /delete from storage\.objects[\s\S]*?bucket_id = 'animal-photos'/i);
    assert.match(sql, /delete from public\.animals/i);
    assert.match(sql, /delete from public\.profiles/i);
    assert.doesNotMatch(
      sql.slice(sql.indexOf('create or replace function private.admin_prepare_member_deletion'),
        sql.indexOf('create or replace function public.admin_prepare_member_deletion_service')),
      /delete from auth\.users/i,
      'Auth deletion must be completed by the server-side Admin API',
    );
  });
}

for (const file of ['supabase_v52.sql', 'supabase_setup.sql']) {
  test(`Given ${file}, when admin premium access is granted, then trial, timed, and permanent windows are server validated and audited`, () => {
    const sql = read(file);

    assert.match(sql, /p_grant_type\s+text/i);
    assert.match(sql, /p_duration_days\s+integer/i);
    assert.match(sql, /p_grant_type\s+not in\s*\('trial','timed','permanent'\)/i);
    assert.match(sql, /p_duration_days\s+not\s+between\s+1\s+and\s+3650/i);
    assert.match(sql, /make_interval\s*\(\s*days\s*=>\s*p_duration_days\s*\)/i);
    assert.match(sql, /'grant_type',\s*p_grant_type/i);
    assert.match(sql, /'duration_days',\s*p_duration_days/i);
    assert.match(sql, /revoke all on function public\.admin_set_member_tier_service[\s\S]*?from public, anon, authenticated/i);
    assert.match(sql, /grant execute on function public\.admin_set_member_tier_service[\s\S]*?to service_role/i);
  });
}
