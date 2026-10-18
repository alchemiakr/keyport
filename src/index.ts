import { authenticate, configured, decrypt, encrypt, mutation, Problem, readJson, required } from './security.ts';
import { apiToken, issueKey, tailnetName, verifyConnection } from './tailscale.ts';

type Connection = { id: string; profile_id: string; tailnet: string; name: string; token_cipher: string };
const metadata = 'id, profile_id, tailnet, name, token_saved_at, token_expires_on, verified_at, verification_result';
const now = () => new Date().toISOString();
const json = (value: unknown, status = 200) => Response.json(value, { status });
function protect(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('Vary', 'Cookie, Cf-Access-Jwt-Assertion');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(response.body, { status: response.status, headers });
}
function expiry(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Problem(400, 'invalid_expiry', '토큰 만료 예정일을 확인해 주세요.');
  return value;
}
async function connection(env: Env, id: string): Promise<Connection> {
  const row = await env.DB.prepare('SELECT id, profile_id, tailnet, name, token_cipher FROM connections WHERE id = ?').bind(id).first<Connection>();
  if (!row) throw new Problem(404, 'not_found', '연결을 찾을 수 없습니다.');
  return row;
}
async function profile(env: Env, id: string) {
  if (!await env.DB.prepare('SELECT id FROM profiles WHERE id = ?').bind(id).first()) throw new Problem(404, 'not_found', '계정 프로필을 찾을 수 없습니다.');
}
async function claim(env: Env, id: string, seconds: number) {
  const row = await env.DB.prepare(`INSERT INTO rate_limits (id, next_at) VALUES (?, unixepoch() + ?)
    ON CONFLICT(id) DO UPDATE SET next_at = excluded.next_at WHERE rate_limits.next_at <= unixepoch() RETURNING id`).bind(id, seconds).first();
  if (!row) throw new Problem(429, 'rate_limit', '요청이 너무 빠릅니다. 잠시 후 직접 다시 시도해 주세요.');
}
async function api(request: Request, env: Env, actor: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET') {
    if (path === '/api/session') return json({ actor });
    if (path === '/api/profiles') return json((await env.DB.prepare('SELECT * FROM profiles ORDER BY created_at, id').all()).results);
    if (path === '/api/connections') return json((await env.DB.prepare(`SELECT ${metadata} FROM connections ORDER BY name, id`).all()).results);
    if (path === '/api/audit') return json((await env.DB.prepare('SELECT * FROM audit ORDER BY requested_at DESC LIMIT 100').all()).results);
    throw new Problem(404, 'not_found', '요청한 API가 없습니다.');
  }
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) throw new Problem(405, 'method_not_allowed', '지원하지 않는 요청 방식입니다.');
  mutation(request, env);
  const body = await readJson(request);
  if (path === '/api/profiles' && request.method === 'POST') {
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO profiles (id, name, expected_owner, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, required(body.name), required(body.expected_owner, 254), now()).run();
    return json({ id }, 201);
  }
  const profileRoute = /^\/api\/profiles\/([a-f0-9-]{36})$/.exec(path);
  if (profileRoute) {
    const id = profileRoute[1];
    await profile(env, id);
    if (request.method === 'PATCH') {
      await env.DB.prepare('UPDATE profiles SET name = ?, expected_owner = ? WHERE id = ?').bind(required(body.name), required(body.expected_owner, 254), id).run();
    } else if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(id).run();
    } else throw new Problem(405, 'method_not_allowed', '지원하지 않는 요청 방식입니다.');
    return json({ ok: true });
  }
  if (path === '/api/connections' && request.method === 'POST') {
    const id = crypto.randomUUID();
    const profileId = required(body.profile_id, 36);
    await profile(env, profileId);
    const tailnet = tailnetName(body.tailnet), token = apiToken(body.token), name = required(body.name), expiresOn = expiry(body.token_expires_on);
    if (await env.DB.prepare('SELECT id FROM connections WHERE profile_id = ? AND tailnet = ?').bind(profileId, tailnet).first()) throw new Problem(409, 'duplicate_connection', '이 프로필에 이미 등록된 Tailnet입니다.');
    await claim(env, `verify:${actor}`, 5);
    await verifyConnection(tailnet, token);
    const time = now();
    await env.DB.prepare(`INSERT INTO connections (id, profile_id, tailnet, name, token_cipher, token_saved_at, token_expires_on, verified_at, verification_result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success')`).bind(id, profileId, tailnet, name, await encrypt(env.TOKEN_ENCRYPTION_KEY, id, token), time, expiresOn, time).run();
    return json({ id }, 201);
  }
  if (path === '/api/reencrypt' && request.method === 'POST') {
    const rows = (await env.DB.prepare('SELECT id, token_cipher FROM connections').all<{id: string; token_cipher: string}>()).results;
    for (const row of rows) {
      const plain = await decrypt(env.TOKEN_ENCRYPTION_KEY, row.id, row.token_cipher, env.PREVIOUS_ENCRYPTION_KEY);
      await env.DB.prepare('UPDATE connections SET token_cipher = ? WHERE id = ? AND token_cipher = ?')
        .bind(await encrypt(env.TOKEN_ENCRYPTION_KEY, row.id, plain), row.id, row.token_cipher).run();
    }
    const current = (await env.DB.prepare('SELECT id, token_cipher FROM connections').all<{id: string; token_cipher: string}>()).results;
    for (const row of current) await decrypt(env.TOKEN_ENCRYPTION_KEY, row.id, row.token_cipher);
    return json({ ok: true, processed: rows.length });
  }
  const route = /^\/api\/connections\/([a-f0-9-]{36})(?:\/(verify|issue))?$/.exec(path);
  if (!route) throw new Problem(404, 'not_found', '요청한 API가 없습니다.');
  const row = await connection(env, route[1]);
  const action = route[2];
  if (!action && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM connections WHERE id = ?').bind(row.id).run();
    return json({ ok: true });
  }
  if (!action && request.method === 'PATCH') {
    const name = required(body.name);
    if (body.token !== undefined) {
      const token = apiToken(body.token), expiresOn = expiry(body.token_expires_on);
      await claim(env, `verify:${actor}`, 5);
      await verifyConnection(row.tailnet, token);
      const result = await env.DB.prepare(`UPDATE connections SET name = ?, token_cipher = ?, token_saved_at = ?, token_expires_on = ?, verified_at = ?, verification_result = 'success' WHERE id = ? AND token_cipher = ?`)
        .bind(name, await encrypt(env.TOKEN_ENCRYPTION_KEY, row.id, token), now(), expiresOn, now(), row.id, row.token_cipher).run();
      if (!result.meta.changes) throw new Problem(409, 'connection_changed', '연결이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
    } else await env.DB.prepare('UPDATE connections SET name = ? WHERE id = ?').bind(name, row.id).run();
    return json({ ok: true });
  }
  if (request.method !== 'POST' || !action) throw new Problem(405, 'method_not_allowed', '지원하지 않는 요청 방식입니다.');
  await claim(env, `${action}:${actor}`, 5);
  if (action === 'verify') {
    try {
      await verifyConnection(row.tailnet, await decrypt(env.TOKEN_ENCRYPTION_KEY, row.id, row.token_cipher, env.PREVIOUS_ENCRYPTION_KEY));
      await env.DB.prepare("UPDATE connections SET verified_at = ?, verification_result = 'success' WHERE id = ? AND token_cipher = ?").bind(now(), row.id, row.token_cipher).run();
      return json({ ok: true });
    } catch (error) {
      await env.DB.prepare('UPDATE connections SET verified_at = ?, verification_result = ? WHERE id = ? AND token_cipher = ?').bind(now(), error instanceof Problem ? error.code : 'credential_error', row.id, row.token_cipher).run();
      throw error;
    }
  }
  await claim(env, `connection:${row.id}`, 30);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO audit (id, actor, connection_id, requested_at, outcome) VALUES (?, ?, ?, ?, 'pending')").bind(id, actor, row.id, now()).run();
  let issued = false;
  try {
    const token = await decrypt(env.TOKEN_ENCRYPTION_KEY, row.id, row.token_cipher, env.PREVIOUS_ENCRYPTION_KEY);
    const key = await issueKey(row.tailnet, token);
    issued = true;
    await env.DB.prepare("UPDATE audit SET key_id = ?, expires_at = ?, outcome = 'success' WHERE id = ?").bind(key.id, key.expires, id).run();
    return json({ ...key, connection_id: row.id, tailnet: row.tailnet, profile_id: row.profile_id });
  } catch (error) {
    const outcome = issued ? 'issuance_unknown' : error instanceof Problem ? error.code : 'credential_error';
    await env.DB.prepare('UPDATE audit SET outcome = ? WHERE id = ?').bind(outcome, id).run();
    if (issued) throw new Problem(502, 'issuance_unknown', '발급 후 결과 기록에 실패했습니다. Tailscale 콘솔을 확인해 주세요. 자동 재시도하지 않습니다.');
    throw error;
  }
}
export default {
  async fetch(request: Request, env: Env) {
    try {
      const pathBeforeAuth = new URL(request.url).pathname;
      const setupAssets = new Set(['/setup.js', '/icon.svg']);
      if (!configured(env) && ['GET', 'HEAD'].includes(request.method)
        && (['/', '/setup', '/setup.html'].includes(pathBeforeAuth) || setupAssets.has(pathBeforeAuth) || /^\/_astro\/[A-Za-z0-9_.-]+\.css$/.test(pathBeforeAuth))) {
        const url = new URL(request.url);
        if (!setupAssets.has(pathBeforeAuth) && !pathBeforeAuth.startsWith('/_astro/')) url.pathname = '/setup.html';
        return protect(await env.ASSETS.fetch(new Request(url.toString(), { method: request.method })));
      }
      const actor = await authenticate(request, env);
      const path = new URL(request.url).pathname;
      const assetUrl = new URL(request.url);
      if (path === '/setup') assetUrl.pathname = '/setup.html';
      const response = path.startsWith('/api/') ? await api(request, env, actor)
        : ['GET', 'HEAD'].includes(request.method) ? await env.ASSETS.fetch(new Request(assetUrl.toString(), request))
        : json({ error: 'method_not_allowed', message: '지원하지 않는 요청 방식입니다.' }, 405);
      return protect(response);
    } catch (error) {
      const problem = error instanceof Problem ? error : new Problem(500, 'internal_error', '요청을 처리하지 못했습니다. 발급 요청은 자동 재시도하지 마세요.');
      return protect(json({ error: problem.code, message: problem.message, ...(configured(env) ? {} : { setup: '/setup' }) }, problem.status));
    }
  },
  async scheduled(_controller, env) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM audit WHERE requested_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')"),
      env.DB.prepare('DELETE FROM rate_limits WHERE next_at < unixepoch()'),
    ]);
  },
} satisfies ExportedHandler<Env>;
