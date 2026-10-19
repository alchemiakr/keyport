import { test, beforeAll, beforeEach, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from '../src/index.ts';
import { encrypt, decrypt } from '../src/security.ts';
import { keyContract } from '../src/tailscale.ts';

const origin = 'https://keyport.example.com';
const aud = 'a'.repeat(64);
const issuer = 'https://keyport-test.cloudflareaccess.com';
const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const nativeFetch = globalThis.fetch;
let sqlite: Database, env: Env, jwt: string, stranger: string, expired: string, wrongAud: string, wrongIssuer: string;
let upstream: { url: string; authorization: string; body?: unknown }[] = [];
let upstreamStatus = 200, upstreamMode = 'normal';
const pair = await generateKeyPair('RS256');
const publicJwk = { ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
async function token(email = 'admin@example.com', audience = aud, iss = issuer, expires = '5m') {
  return new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(iss).setAudience(audience).setSubject(email).setIssuedAt().setExpirationTime(expires).sign(pair.privateKey);
}
// 실제 SQLite로 바인딩·트랜잭션·제약 조건을 검증하고, D1 전송 인터페이스만 대체한다.
function database() {
  function prepare(sql: string) {
    let params: (string | number | null)[] = [];
    const statement = {
      bind(...values: (string | number | null)[]) { params = values; return statement; },
      async first() { return sqlite.prepare(sql).get(...params) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
      async run() { const result = sqlite.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  }
  return { prepare, async batch(statements: { run(): Promise<unknown> }[]) { sqlite.exec('BEGIN'); try { const results = []; for (const stmt of statements) results.push(await stmt.run()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
}
async function request(path: string, method = 'GET', body?: unknown, options: { jwt?: string; origin?: string; host?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers({ 'Cf-Access-Jwt-Assertion': options.jwt ?? jwt, ...options.headers });
  if (method !== 'GET') { headers.set('Origin', options.origin ?? origin); headers.set('Content-Type', 'application/json'); headers.set('X-Keyport-Request', '1'); }
  return worker.fetch(new Request(`${options.host ?? origin}${path}`, { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }) }), env);
}
async function addProfile(name = '개인', owner = '미검증 사용자') {
  const response = await request('/api/profiles', 'POST', { name, expected_owner: owner }); assert.equal(response.status, 201); return (await response.json() as { id: string }).id;
}
function resetRate() { sqlite.exec('DELETE FROM rate_limits'); }
async function addConnection(profileId: string, tailnet = 'example.com', tokenValue = 'tskey-api-userA-secret') {
  resetRate(); const response = await request('/api/connections', 'POST', { name: '내 네트워크', profile_id: profileId, tailnet, token: tokenValue, token_expires_on: '2026-12-01' });
  assert.equal(response.status, 201, await response.clone().text()); return (await response.json() as { id: string }).id;
}
beforeAll(async () => {
  jwt = await token(); stranger = await token('stranger@example.com'); expired = await token('admin@example.com', aud, issuer, '-5m'); wrongAud = await token('admin@example.com', 'other'); wrongIssuer = await token('admin@example.com', aud, 'https://other.cloudflareaccess.com');
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === `${issuer}/cdn-cgi/access/certs`) return Response.json({ keys: [publicJwk] });
    assert.match(url, /^https:\/\/api\.tailscale\.com\/api\/v2\/tailnet\//);
    upstream.push({ url, authorization: new Request(url, init).headers.get('Authorization') ?? '', ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (upstreamMode === 'timeout') throw new DOMException('timeout', 'TimeoutError');
    if (upstreamStatus !== 200) return Response.json({ message: 'SENSITIVE UPSTREAM CONTENT' }, { status: upstreamStatus });
    if (upstreamMode === 'empty') return Response.json({});
    if (init?.method === 'POST') return Response.json({ id: 'testKey123', key: 'tskey-auth-generated-secret', expires: new Date(Date.now() + 86400 * 1000).toISOString() });
    return Response.json({ keys: [] });
  }) as typeof fetch;
});
beforeEach(async () => {
  sqlite?.close(); sqlite = new Database(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON'); sqlite.exec(await Bun.file('migrations/0001_initial.sql').text());
  env = { DB: database(), ASSETS: { fetch: async () => new Response('static asset') }, APP_ORIGIN: origin, ACCESS_TEAM_DOMAIN: 'keyport-test.cloudflareaccess.com', ACCESS_AUD: aud, ADMIN_EMAILS: 'admin@example.com', TOKEN_ENCRYPTION_KEY: secret, PREVIOUS_ENCRYPTION_KEY: '' } as unknown as Env;
  upstream = []; upstreamMode = 'normal'; upstreamStatus = 200;
});
afterAll(() => { globalThis.fetch = nativeFetch; sqlite.close(); });

test('초기 설정 전에는 안내 자산만 공개하고 API·앱 자산·발급을 차단한다', async () => {
  env.TOKEN_ENCRYPTION_KEY = '';
  assert.equal((await request('/')).status, 200);
  for (const [path, method] of [['/app.js', 'GET'], ['/connections', 'GET'], ['/connections.html', 'GET'], ['/api/profiles', 'GET'], ['/api/connections/not-real/issue', 'POST']]) assert.equal((await request(path, method)).status, 503);
  assert.equal(upstream.length, 0);
});
test('설정 후보는 현재 요청에서만 읽고 인증·설정 저장에 사용하지 않는다', async () => {
  env.TOKEN_ENCRYPTION_KEY = '';
  const response = await request('/setup/context');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hints: { team: 'keyport-test.cloudflareaccess.com', aud, admins: 'admin@example.com' } });
  assert.match(response.headers.get('Cache-Control')!, /no-store/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  const forged = (claims: Record<string, unknown>) => `${btoa('{}')}.${btoa(JSON.stringify(claims))}.fake`;
  const claims = { iss: issuer, aud: [aud], email: 'OTHER@example.com', exp: Math.floor(Date.now() / 1000) + 60, ignored: 'private-claim' };
  const hints = await (await request('/setup/context', 'GET', undefined, { jwt: forged(claims) })).text();
  assert.deepEqual(JSON.parse(hints), { hints: { team: 'keyport-test.cloudflareaccess.com', aud, admins: 'other@example.com' } });
  assert.doesNotMatch(hints, /private-claim|fake|signature|token/);
  assert.equal(env.ADMIN_EMAILS, 'admin@example.com');
  assert.equal(env.TOKEN_ENCRYPTION_KEY, '');
  assert.equal((await request('/api/session', 'GET', undefined, { jwt: forged(claims) })).status, 503);
  for (const value of ['', 'broken', 'x'.repeat(8193), expired, forged({ ...claims, iss: 'https://evil.example.com' }), forged({ ...claims, iss: `${issuer}/extra` })]) {
    assert.deepEqual(await (await request('/setup/context', 'GET', undefined, { jwt: value })).json(), { hints: {} });
  }
  const ambiguous = await request('/setup/context', 'GET', undefined, { jwt: forged({ ...claims, aud: [aud, 'b'.repeat(64)], email: 'bad,email' }) });
  assert.deepEqual(await ambiguous.json(), { hints: { team: 'keyport-test.cloudflareaccess.com' } });
  assert.equal((await request('/setup/context', 'POST')).status, 503);
  env.TOKEN_ENCRYPTION_KEY = secret;
  assert.equal((await request('/setup/context', 'GET', undefined, { jwt: forged(claims) })).status, 403);
  assert.equal(upstream.length, 0);
});
test('가짜 신원·서명·만료·다른 AUD/issuer·비허용 관리자·대체 도메인을 거부한다', async () => {
  for (const value of ['', 'forged.jwt.signature', stranger, expired, wrongAud, wrongIssuer]) {
    const r = await request('/api/connections', 'GET', undefined, { jwt: value, headers: { 'Cf-Access-Authenticated-User-Email': 'admin@example.com' } });
    assert.ok([401, 403].includes(r.status));
  }
  assert.equal((await request('/api/session', 'GET', undefined, { host: 'https://preview.example.com' })).status, 403);
  assert.equal(upstream.length, 0);
});
test('CSRF·GET 발급·임의 Tailnet URL을 차단한다', async () => {
  assert.equal((await request('/api/profiles', 'POST', { name: 'x', expected_owner: 'x' }, { origin: 'https://evil.example' })).status, 403);
  const p = await addProfile();
  const r = await request('/api/connections', 'POST', { profile_id: p, name: 'x', tailnet: 'https://evil.example', token: 'tskey-api-test' }); assert.equal(r.status, 400);
  assert.equal((await request('/api/connections/00000000-0000-0000-0000-000000000000/issue')).status, 404);
  assert.equal(upstream.length, 0);
});
test('두 계정·두 Tailnet·같은 Tailnet의 다른 사용자 토큰이 분리되고 비밀이 반환되지 않는다', async () => {
  const p1 = await addProfile('개인'), p2 = await addProfile('업무');
  const a = await addConnection(p1), b = await addConnection(p2, 'example.com', 'tskey-api-userB-secret');
  await addConnection(p1, 'second.example.com', 'tskey-api-userC-secret');
  const list = await (await request('/api/connections')).text();
  assert.equal(JSON.parse(list).length, 3); assert.doesNotMatch(list, /tskey-|token_cipher|secret/);
  const stored = sqlite.prepare('SELECT token_cipher FROM connections WHERE id = ?').get(a) as {token_cipher: string};
  assert.ok(!stored.token_cipher.includes('tskey-')); assert.equal(await decrypt(secret, a, stored.token_cipher), 'tskey-api-userA-secret');
  for (const [id, expected] of [[a, 'tskey-api-userA-secret'], [b, 'tskey-api-userB-secret']]) {
    resetRate(); const r = await request(`/api/connections/${id}/issue`, 'POST', { token: 'tskey-api-attacker', tailnet: 'evil.example', reusable: true });
    assert.equal(r.status, 200);
    const last = upstream.at(-1)!;
    assert.equal(atob(last.authorization.slice(6)), `${expected}:`); assert.deepEqual(last.body, keyContract); assert.match(last.url, /\/example.com\/keys$/);
  }
  const audit = await (await request('/api/audit')).text(); assert.doesNotMatch(audit, /tskey-|secret/); assert.equal(JSON.parse(audit).length, 2);
});
test('암호문 변조·다른 연결 AAD·잘못된 마스터 키를 거부하고 nonce를 재사용하지 않는다', async () => {
  const one = await encrypt(secret, 'one', 'tskey-api-secret'), two = await encrypt(secret, 'one', 'tskey-api-secret');
  assert.notEqual(one, two); await assert.rejects(decrypt(secret, 'two', one));
  const parts = one.split('.'); parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
  await assert.rejects(decrypt(secret, 'one', parts.join('.')));
  await assert.rejects(decrypt(btoa('x'.repeat(32)), 'one', one));
});
test('프로필 이름 수정·연결 이름 수정·토큰 교체·검증·삭제가 작동하고 기존 토큰은 유지 또는 교체된다', async () => {
  const p = await addProfile(), id = await addConnection(p);
  assert.equal((await request(`/api/profiles/${p}`, 'PATCH', { name: '새 이름', expected_owner: '새 표시' })).status, 200);
  assert.equal((await request(`/api/connections/${id}`, 'PATCH', { name: '별칭' })).status, 200);
  resetRate(); assert.equal((await request(`/api/connections/${id}`, 'PATCH', { name: '교체', token: 'tskey-api-replaced', token_expires_on: '2027-01-01' })).status, 200);
  resetRate(); assert.equal((await request(`/api/connections/${id}/verify`, 'POST')).status, 200);
  assert.equal(atob(upstream.at(-1)!.authorization.slice(6)), 'tskey-api-replaced:');
  const beforeDelete = upstream.length;
  assert.equal((await request(`/api/connections/${id}`, 'DELETE')).status, 200);
  assert.equal(upstream.length, beforeDelete);
  await addConnection(p); assert.equal((await request(`/api/profiles/${p}`, 'DELETE')).status, 200);
  assert.equal((await (await request('/api/connections')).json() as unknown[]).length, 0);
});
test('실패한 토큰 교체는 기존 토큰을 보존한다', async () => {
  const id = await addConnection(await addProfile()); const cipher = sqlite.prepare('SELECT token_cipher FROM connections WHERE id = ?').get(id);
  upstreamStatus = 401; resetRate();
  assert.equal((await request(`/api/connections/${id}`, 'PATCH', { name: 'x', token: 'tskey-api-invalid' })).status, 422);
  assert.deepEqual(sqlite.prepare('SELECT token_cipher FROM connections WHERE id = ?').get(id), cipher);
});
test('중복 클릭·병렬 발급은 연결당 하나만 upstream으로 전달한다', async () => {
  const id = await addConnection(await addProfile()); upstream = [];
  const responses = await Promise.all([request(`/api/connections/${id}/issue`, 'POST'), request(`/api/connections/${id}/issue`, 'POST')]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 429]); assert.equal(upstream.length, 1);
  resetRate(); await request(`/api/connections/${id}/issue`, 'POST');
  const again = await request(`/api/connections/${id}/issue`, 'POST'); assert.equal(again.status, 429);
});
test('만료·권한·429·서버 오류·타임아웃·빈 결과를 비밀 노출이나 자동 재시도 없이 처리한다', async () => {
  const id = await addConnection(await addProfile());
  for (const [status, mode, expected] of [[401, 'normal', 422], [403, 'normal', 422], [429, 'normal', 429], [500, 'normal', 502], [200, 'timeout', 502], [200, 'empty', 502]] as const) {
    resetRate(); upstreamStatus = status; upstreamMode = mode; const count = upstream.length;
    const r = await request(`/api/connections/${id}/issue`, 'POST'); assert.equal(r.status, expected);
    assert.doesNotMatch(await r.text(), /SENSITIVE|tskey-/); assert.equal(upstream.length, count + 1);
  }
});
test('모든 응답은 no-store이며 외부 CORS를 허용하지 않는다', async () => {
  for (const path of ['/', '/api/session', '/api/connections', '/missing']) {
    const r = await request(path); assert.match(r.headers.get('Cache-Control')!, /no-store/); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null); assert.ok(r.headers.get('Content-Security-Policy'));
  }
});
test('암호화 키 교체로 재암호화한 토큰은 새 키로만 복구된다', async () => {
  const id = await addConnection(await addProfile());
  env.PREVIOUS_ENCRYPTION_KEY = secret; env.TOKEN_ENCRYPTION_KEY = btoa('n'.repeat(32));
  assert.equal((await request('/api/reencrypt', 'POST')).status, 200);
  const row = sqlite.prepare('SELECT token_cipher FROM connections WHERE id = ?').get(id) as {token_cipher: string};
  assert.equal(await decrypt(env.TOKEN_ENCRYPTION_KEY, id, row.token_cipher), 'tskey-api-userA-secret'); await assert.rejects(decrypt(secret, id, row.token_cipher));
});
test('90일이 지난 감사 기록과 만료한 제한만 정리한다', async () => {
  sqlite.exec("INSERT INTO audit VALUES ('old','admin','gone','2020-01-01T00:00:00.000Z',NULL,NULL,'success')");
  sqlite.prepare('INSERT INTO audit VALUES (?,?,?,?,NULL,NULL,?)').run('new', 'admin', 'gone', new Date().toISOString(), 'success');
  sqlite.exec("INSERT INTO rate_limits VALUES ('old',0),('future',9999999999)");
  await worker.scheduled({} as ScheduledController, env);
  assert.equal(sqlite.prepare<{n: number}, []>('SELECT count(*) n FROM audit').get()!.n, 1); assert.equal(sqlite.prepare<{n: number}, []>('SELECT count(*) n FROM rate_limits').get()!.n, 1);
});
