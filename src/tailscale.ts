import { Problem, readJson, required } from './security.ts';

export function tailnetName(value: unknown): string {
  const name = required(value, 253);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.@-]*$/.test(name) || name === '-') throw new Problem(400, 'invalid_tailnet', '명시적인 Tailnet 식별자를 입력해 주세요.');
  return name;
}
export function apiToken(value: unknown): string {
  const token = required(value, 512);
  if (!/^tskey-api-[A-Za-z0-9-]+$/.test(token)) throw new Problem(400, 'invalid_token', '사용자 API 토큰(tskey-api-)이 필요합니다.');
  return token;
}
export const keyContract = {
  keyType: 'auth', expirySeconds: 86400,
  capabilities: { devices: { create: { reusable: false, preauthorized: true, ephemeral: false, tags: [] } } },
};
async function call(tailnet: string, token: string, create: boolean): Promise<Record<string, unknown>> {
  try {
    // Workers rejects redirect: 'error'; inspect 3xx responses without forwarding credentials.
    const response = await fetch(`https://api.tailscale.com/api/v2/tailnet/${encodeURIComponent(tailnet)}/keys`, {
      method: create ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Basic ${btoa(`${token}:`)}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(create ? { body: JSON.stringify(keyContract) } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400) throw new Problem(502, create ? 'issuance_unknown' : 'upstream_redirect', create
        ? '리다이렉트 응답을 받아 발급 여부를 확인할 수 없습니다. Tailscale 콘솔을 확인해 주세요. 자동 재시도하지 않습니다.'
        : 'Tailscale이 다른 주소로 이동을 요청해 검증을 중단했습니다. 토큰은 전달하지 않았습니다.');
      if (response.status === 401) throw new Problem(422, 'token_expired', '토큰이 만료되었거나 유효하지 않습니다. 토큰을 교체해 주세요.');
      if (response.status === 403 || response.status === 404) throw new Problem(422, 'tailnet_denied', '대상 Tailnet 또는 필요한 권한을 확인해 주세요.');
      if (response.status === 429) throw new Problem(429, 'upstream_rate_limit', 'Tailscale 요청 제한입니다. 잠시 후 직접 다시 시도해 주세요.');
      throw new Problem(502, create ? 'issuance_unknown' : 'upstream_error', create ? '발급 성공 여부를 확인할 수 없습니다. Tailscale 콘솔을 확인해 주세요. 자동 재시도하지 않습니다.' : 'Tailscale 검증에 실패했습니다.');
    }
    return await readJson(response, 1024 * 1024);
  } catch (error) {
    if (error instanceof Problem && !['invalid_json', 'too_large'].includes(error.code)) throw error;
    throw new Problem(502, create ? 'issuance_unknown' : 'verification_unavailable', create
      ? '응답을 받지 못해 발급 여부를 알 수 없습니다. Tailscale 콘솔을 확인해 주세요. 자동 재시도하지 않습니다.'
      : '연결을 검증할 수 없습니다. 네트워크 상태를 확인해 주세요.');
  }
}
export async function verifyConnection(tailnet: string, token: string): Promise<void> {
  const data = await call(tailnet, token, false);
  if (!Array.isArray(data.keys)) throw new Problem(502, 'verification_unavailable', 'Tailscale 검증 응답이 올바르지 않습니다.');
}
export async function issueKey(tailnet: string, token: string) {
  const data = await call(tailnet, token, true);
  if (typeof data.key !== 'string' || !/^tskey-auth-[A-Za-z0-9-]+$/.test(data.key)
    || typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id)
    || typeof data.expires !== 'string' || !Number.isFinite(Date.parse(data.expires))
    || Date.parse(data.expires) <= Date.now() || Date.parse(data.expires) > Date.now() + 86400 * 1000 + 60000) {
    throw new Problem(502, 'issuance_unknown', '발급 응답이 불완전합니다. Tailscale 콘솔에서 확인해 주세요. 자동 재시도하지 않습니다.');
  }
  return { key: data.key, id: data.id, expires: data.expires };
}
