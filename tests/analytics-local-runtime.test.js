const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/analytics.js'), 'utf8');

test('Given a local QA host, when country analytics runs, then Cloudflare trace is not requested', async () => {
  let fetchCalls = 0;
  const storage = new Map();
  const window = {};
  const context = {
    window,
    navigator: { userAgent: 'QA Browser', languages: ['ko-KR'], webdriver: false },
    document: { referrer: '' },
    location: { hostname: '127.0.0.1' },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    fetch: async () => {
      fetchCalls += 1;
      return { ok: false, text: async () => '' };
    },
    setTimeout,
    clearTimeout,
    URL,
    Date,
    JSON,
    Promise,
    Math,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'assets/analytics.js' });

  const country = await window.StudioAnalytics.country();

  assert.equal(country, null);
  assert.equal(fetchCalls, 0);
});

