import { createRemoteJWKSet, jwtVerify } from 'jose';

export class Problem extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export function required(value: unknown, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Problem(400, 'invalid_input', '입력값의 형식이나 길이를 확인해 주세요.');
  }
  return value.trim();
}
export async function readJson(message: Request | Response, max = 16384): Promise<Record<string, unknown>> {
  const reader = message.body?.getReader();
  if (!reader) throw new Problem(400, 'invalid_json', 'JSON 본문이 필요합니다.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Problem(413, 'too_large', '응답 또는 요청이 너무 큽니다.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new Problem(400, 'invalid_json', '올바른 JSON 응답 또는 요청이 필요합니다.'); }
}
export function configured(env: Env): boolean {
  try {
    const origin = new URL(env.APP_ORIGIN);
    return origin.protocol === 'https:' && origin.origin === env.APP_ORIGIN
      && /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)
      && /^[a-f0-9]{64}$/.test(env.ACCESS_AUD)
      && env.ADMIN_EMAILS.split(',').some(x => x.trim().includes('@'))
      && /^[A-Za-z0-9+/]{43}=$/.test(env.TOKEN_ENCRYPTION_KEY);
  } catch { return false; }
}
// issuer와 공개키 URL은 배포 설정에서만 가져온다.
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function authenticate(request: Request, env: Env): Promise<string> {
  if (!configured(env)) throw new Problem(503, 'setup_required', '초기 설정이 끝나지 않았습니다. 앱 첫 화면의 설정 wizard를 따라 주세요.');
  if (new URL(request.url).origin !== env.APP_ORIGIN) throw new Problem(403, 'wrong_host', '설정된 앱 URL로 열어 주세요.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new Problem(401, 'login_required', 'Access에 다시 로그인해 주세요.');
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let keys = jwks.get(issuer);
  if (!keys) { keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)); jwks.set(issuer, keys); }
  try {
    const { payload } = await jwtVerify(token, keys, { issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email'] });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (!env.ADMIN_EMAILS.split(',').map(x => x.trim().toLowerCase()).includes(email)) throw new Error();
    return email;
  } catch { throw new Problem(403, 'access_denied', '허용된 관리자의 Access 로그인이 필요합니다.'); }
}
function decode(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function encode(value: Uint8Array): string { return btoa(String.fromCharCode(...value)); }
async function master(secret: string) {
  const bytes = decode(secret);
  if (bytes.length !== 32) throw new Error('invalid master key');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(secret: string, id: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) }, await master(secret), new TextEncoder().encode(token));
  return `1.${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function decrypt(secret: string, id: string, envelope: string, previous?: string): Promise<string> {
  const [version, nonce, cipher, extra] = envelope.split('.');
  if (version !== '1' || !nonce || !cipher || extra) throw new Error('invalid ciphertext');
  const params = { name: 'AES-GCM', iv: decode(nonce), additionalData: new TextEncoder().encode(id) };
  try { return new TextDecoder().decode(await crypto.subtle.decrypt(params, await master(secret), decode(cipher))); }
  catch (error) {
    if (!previous) throw error;
    return new TextDecoder().decode(await crypto.subtle.decrypt(params, await master(previous), decode(cipher)));
  }
}
export function mutation(request: Request, env: Env) {
  if (request.headers.get('Origin') !== env.APP_ORIGIN || request.headers.get('X-Keyport-Request') !== '1'
    || !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new Problem(403, 'wrong_origin', '같은 앱 화면에서 요청해 주세요.');
  }
}
