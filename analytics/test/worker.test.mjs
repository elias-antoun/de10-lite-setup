import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

import worker from '../worker.mjs';

const ORIGIN = 'https://elias-antoun.github.io';
const SITE_PATH = '/de10-lite-setup/';
const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');

let miniflare;
let db;
let env;

before(async () => {
  miniflare = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: '2026-09-22',
    cf: false,
    modules: true,
    script: 'export default { fetch() { return new Response() } }',
    d1Databases: ['DB'],
    d1Persist: false,
  }));
  db = await miniflare.getD1Database('DB');
  for (const statement of schema.split(';').filter((part) => part.trim())) {
    await db.prepare(statement).run();
  }
});

beforeEach(async () => {
  await db.exec('DELETE FROM visits');
  env = {
    DB: db,
    ALLOWED_ORIGIN: ORIGIN,
    SITE_PATH,
    RETENTION_DAYS: '30',
  };
});

after(async () => {
  await miniflare?.dispose();
});

function request(body, {
  method = 'POST',
  path = '/visit',
  origin = ORIGIN,
  cf,
  headers = {},
} = {}) {
  const requestHeaders = new Headers({
    Origin: origin,
    'Content-Type': 'application/json',
    'CF-Connecting-IP': '203.0.113.7',
    'CF-IPCountry': 'LB',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
    ...headers,
  });
  const request = new Request(`https://collector.example${path}`, {
    method,
    headers: requestHeaders,
    body: method === 'POST' ? body : undefined,
  });
  if (cf) Object.defineProperty(request, 'cf', { value: cf });
  return request;
}

async function rows() {
  return db.prepare('SELECT * FROM visits ORDER BY visited_at, id').all();
}

function payload(overrides = {}) {
  return JSON.stringify({
    path: SITE_PATH,
    language: 'en-US',
    viewport_width: 1280,
    viewport_height: 720,
    referrer: 'example.com',
    ...overrides,
  });
}

test('stores a valid IPv4 visit using server-controlled fields', async () => {
  const response = await worker.fetch(request(payload()), env);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await rows();
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].ip, '203.0.113.7');
  assert.equal(result.results[0].country, 'LB');
  assert.equal(result.results[0].path, SITE_PATH);
  assert.equal(result.results[0].language, 'en-US');
  assert.equal(result.results[0].viewport_width, 1280);
  assert.equal(result.results[0].viewport_height, 720);
  assert.equal(result.results[0].referrer, 'example.com');
  assert.equal(result.results[0].browser, 'Chrome');
  assert.equal(result.results[0].os, 'Linux');
  assert.equal(result.results[0].device_type, 'desktop');
  assert.match(result.results[0].id, /^[0-9a-f-]{36}$/);
  assert.match(result.results[0].visited_at, /^\d{4}-\d\d-\d\dT/);
});

test('stores an IPv6 visit and ignores spoofed server fields and unknown fields', async () => {
  const response = await worker.fetch(request(payload({
    ip: '198.51.100.9',
    country: 'US',
    id: 'spoofed-id',
    visited_at: '2000-01-01T00:00:00.000Z',
    user_agent: 'spoofed-agent',
    secret: 'should-not-be-stored',
  }), {
    headers: {
      'CF-Connecting-IP': '2001:db8::7',
      'CF-IPCountry': 'DE',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    },
    cf: { country: 'LB' },
  }), env);

  assert.equal(response.status, 204);
  const row = (await rows()).results[0];
  assert.equal(row.ip, '2001:db8::7');
  assert.equal(row.country, 'LB');
  assert.notEqual(row.id, 'spoofed-id');
  assert.notEqual(row.visited_at, '2000-01-01T00:00:00.000Z');
  assert.notEqual(row.user_agent, 'spoofed-agent');
  assert.equal(Object.hasOwn(row, 'secret'), false);
});

test('accepts the index document path but rejects query strings and fragments', async () => {
  assert.equal((await worker.fetch(request(payload({ path: `${SITE_PATH}index.html` })), env)).status, 204);
  await db.exec('DELETE FROM visits');
  assert.equal((await worker.fetch(request(payload({ path: `${SITE_PATH}?x=1` })), env)).status, 400);
  assert.equal((await worker.fetch(request(payload({ path: `${SITE_PATH}#section` })), env)).status, 400);
});

test('rejects malformed JSON, null and array bodies', async () => {
  for (const body of ['{', 'null', '[]']) {
    const response = await worker.fetch(request(body), env);
    assert.equal(response.status, 400);
  }
  assert.equal((await rows()).results.length, 0);
});

test('rejects wrong optional types and invalid values', async () => {
  const invalid = [
    { path: 1 },
    { language: 1 },
    { viewport_width: 1.2 },
    { viewport_width: 0 },
    { viewport_width: 20001 },
    { viewport_height: -1 },
    { referrer: 'https://example.com/path' },
    { referrer: 'example.com/path' },
    { referrer: 'bad\\host.example' },
  ];
  for (const override of invalid) {
    const response = await worker.fetch(request(payload(override)), env);
    assert.equal(response.status, 400, JSON.stringify(override));
  }
  assert.equal((await rows()).results.length, 0);
});

test('rejects missing IP and database failure without exposing details', async () => {
  const missingIp = await worker.fetch(request(payload(), { headers: { 'CF-Connecting-IP': '' } }), env);
  assert.equal(missingIp.status, 400);
  const brokenDb = {
    prepare() {
      throw new Error('visitor secret 203.0.113.7');
    },
  };
  const unavailable = await worker.fetch(request(payload()), { ...env, DB: brokenDb });
  assert.equal(unavailable.status, 503);
  assert.equal(await unavailable.text(), 'Service unavailable');
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
});

test('enforces content type, origin, method, route, and body size', async () => {
  const wrongType = await worker.fetch(request(payload(), { headers: { 'Content-Type': 'text/plain' } }), env);
  assert.equal(wrongType.status, 415);
  const wrongOrigin = await worker.fetch(request(payload(), { origin: 'https://evil.example' }), env);
  assert.equal(wrongOrigin.status, 403);
  const wrongMethod = await worker.fetch(request(null, { method: 'GET' }), env);
  assert.equal(wrongMethod.status, 404);
  const wrongRoute = await worker.fetch(request(payload(), { path: '/visit/other' }), env);
  assert.equal(wrongRoute.status, 404);
  const huge = await worker.fetch(request(JSON.stringify({ path: SITE_PATH, value: 'x'.repeat(5000) })), env);
  assert.equal(huge.status, 413);
  assert.equal((await rows()).results.length, 0);
});

test('responds to allowed CORS preflight without credentials', async () => {
  const response = await worker.fetch(request(null, {
    method: 'OPTIONS',
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST');
  assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('does not expose records through read routes or arbitrary origins', async () => {
  await worker.fetch(request(payload()), env);
  for (const [method, path] of [['GET', '/visit'], ['GET', '/'], ['POST', '/records'], ['DELETE', '/visit']]) {
    const response = await worker.fetch(request(null, { method, path }), env);
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.equal(await response.text(), 'Not found');
  }
});

test('scheduled cleanup removes rows older than the retention cutoff and preserves the boundary', async () => {
  const now = '2026-09-22T03:00:00.000Z';
  const old = '2026-08-22T02:59:59.999Z';
  const boundary = '2026-08-23T03:00:00.000Z';
  const recent = '2026-09-22T02:59:59.999Z';
  await db.prepare('INSERT INTO visits (id, visited_at, ip, path) VALUES (?, ?, ?, ?)')
    .bind('old', old, '203.0.113.1', SITE_PATH).run();
  await db.prepare('INSERT INTO visits (id, visited_at, ip, path) VALUES (?, ?, ?, ?)')
    .bind('boundary', boundary, '203.0.113.2', SITE_PATH).run();
  await db.prepare('INSERT INTO visits (id, visited_at, ip, path) VALUES (?, ?, ?, ?)')
    .bind('recent', recent, '203.0.113.3', SITE_PATH).run();

  await worker.scheduled({ scheduledTime: Date.parse(now) }, env, {});
  const result = await db.prepare('SELECT id FROM visits ORDER BY id').all();
  assert.deepEqual(result.results.map((row) => row.id), ['boundary', 'recent']);
});

test('scheduled cleanup rejects with a generic error when persistence fails', async () => {
  const brokenDb = {
    prepare() {
      throw new Error('private visitor row 203.0.113.7');
    },
  };
  await assert.rejects(
    worker.scheduled({ scheduledTime: Date.parse('2026-09-22T03:00:00.000Z') }, { ...env, DB: brokenDb }, {}),
    (error) => error instanceof Error && error.message === 'Analytics cleanup failed',
  );
});

test('scheduled cleanup rejects invalid retention configuration without deleting rows', async () => {
  await db.prepare('INSERT INTO visits (id, visited_at, ip, path) VALUES (?, ?, ?, ?)')
    .bind('keep', '2000-01-01T00:00:00.000Z', '203.0.113.7', SITE_PATH).run();
  await assert.rejects(
    worker.scheduled({ scheduledTime: Date.parse('2026-09-22T03:00:00.000Z') }, { ...env, RETENTION_DAYS: '0' }, {}),
    (error) => error instanceof Error && error.message === 'Analytics cleanup failed',
  );
  assert.equal((await rows()).results.length, 1);
  await assert.rejects(
    worker.scheduled({ scheduledTime: Date.parse('2026-09-22T03:00:00.000Z') }, { ...env, RETENTION_DAYS: '1.5' }, {}),
    /Analytics cleanup failed/,
  );
});
