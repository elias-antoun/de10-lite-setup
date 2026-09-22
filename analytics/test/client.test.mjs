import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const root = new URL('../../index.html', import.meta.url);

function runClient({
  endpoint = 'https://analytics.example.test/visit',
  pathname = '/de10-lite-setup/',
  referrer = 'https://source.example.test/guide/start?campaign=one#details',
  language = ' en-US ',
  innerWidth = 1280,
  innerHeight = 720,
  fetch = () => Promise.resolve({ status: 204 }),
} = {}) {
  const calls = [];
  const notice = { hidden: true, textContent: '' };
  const script = { getAttribute: (name) => name === 'data-endpoint' ? endpoint : null };
  const document = {
    currentScript: script,
    referrer,
    getElementById: (id) => id === 'visit-notice' ? notice : null,
  };
  const navigator = {};
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    get: () => language,
  });
  const context = {
    document,
    location: { pathname },
    navigator,
    innerWidth,
    innerHeight,
    URL,
    JSON,
    Promise,
    fetch: (...args) => {
      calls.push(args);
      return fetch(...args);
    },
    // A collector must not need browser storage to send a page-load event.
    get localStorage() { throw new Error('localStorage must not be read'); },
    get sessionStorage() { throw new Error('sessionStorage must not be read'); },
  };
  vm.runInNewContext(source, context, { filename: 'analytics/client.js' });
  return { calls, notice };
}

test('sends one sanitized page-load payload to a valid endpoint', async () => {
  const { calls, notice } = runClient();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://analytics.example.test/visit');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].keepalive, true);
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    path: '/de10-lite-setup/',
    language: 'en-US',
    viewport_width: 1280,
    viewport_height: 720,
    referrer: 'source.example.test',
  });
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /enabled/i);
  assert.match(notice.textContent, /public IP|country/i);
  assert.match(notice.textContent, /private/i);
  assert.match(notice.textContent, /30 days/i);
});

test('does not collect when the endpoint is missing or malformed', async () => {
  for (const endpoint of [
    '',
    null,
    'http://analytics.example.test/visit',
    'https://analytics.example.test/other',
    'https://analytics.example.test/visit/',
    'https://analytics.example.test/visit?x=1',
    'https://analytics.example.test/visit#fragment',
    'https://user:password@analytics.example.test/visit',
  ]) {
    const { calls, notice } = runClient({ endpoint });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 0, endpoint);
    assert.equal(notice.hidden, true, endpoint);
  }
});

test('normalizes malformed optional browser data to null without reading storage', async () => {
  const { calls } = runClient({
    referrer: 'not a URL',
    language: { value: 'unexpected' },
    innerWidth: 'wide',
    innerHeight: 0,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    path: '/de10-lite-setup/',
    language: null,
    viewport_width: null,
    viewport_height: null,
    referrer: null,
  });
});

test('catches synchronous and asynchronous fetch failures without retrying', async () => {
  let attempts = 0;
  const sync = runClient({ fetch: () => { attempts += 1; throw new Error('blocked'); } });
  const rejected = runClient({ fetch: () => { attempts += 1; return Promise.reject(new Error('offline')); } });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sync.calls.length, 1);
  assert.equal(rejected.calls.length, 1);
  assert.equal(attempts, 2);
});

test('index loads the collector as a deferred classic script and keeps Cloudflare Analytics', async () => {
  const html = await readFile(root, 'utf8');
  assert.match(html, /<script\s+defer\s+src="analytics\/client\.js"\s+data-endpoint=""\s*><\/script>/);
  assert.match(html, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.match(html, /id="visit-notice"/);
});
