const $ = id => document.getElementById(id);
let profiles = [], connections = [], busy = false, resultEpoch = 0;
const notice = message => { $('notice').textContent = message; };
const data = form => Object.fromEntries(new FormData(form));
const selectedProfile = () => profiles.find(p => p.id === $('profile-select').value);
const selectedConnection = () => connections.find(c => c.id === $('connection-select').value);
function clearResult() { resultEpoch++; if (!$('result')) return; $('result-key').value = ''; $('result-context').textContent = ''; $('result-expiry').textContent = ''; $('result').hidden = true; }
function clearTokens() { for (const input of document.querySelectorAll('input[type=password]')) input.value = ''; }
async function api(path, method = 'GET', body) {
  if (!navigator.onLine) throw new Error('오프라인입니다. 온라인 연결 후 직접 다시 시도해 주세요.');
  let response;
  try {
    response = await fetch(`/api/${path}`, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json', 'X-Keyport-Request': '1' }, body: JSON.stringify(body ?? {}) }) });
  } catch {
    $('reauth').hidden = false;
    throw new Error(method === 'POST' && path.endsWith('/issue')
      ? '응답을 받지 못해 발급 성공 여부를 알 수 없습니다. Tailscale 콘솔을 확인해 주세요. 자동 재시도하지 않습니다.'
      : '네트워크 또는 Access 세션을 확인해 주세요. 다시 로그인한 후 직접 시도해 주세요.');
  }
  if (response.status === 401 || response.status === 403) { clearResult(); clearTokens(); $('reauth').hidden = false; }
  const result = await response.json().catch(() => { throw new Error('응답을 해석할 수 없습니다. 발급 요청은 재시도 전에 Tailscale 콘솔을 확인해 주세요.'); });
  if (!response.ok) throw new Error(`${result.message || '요청에 실패했습니다.'}${result.error ? ` (${result.error})` : ''}`);
  return result;
}
async function run(action, feedback = $('notice')) {
  if (busy) return;
  busy = true;
  for (const node of document.querySelectorAll('button, select, input')) node.disabled = true;
  feedback.textContent = '처리 중입니다…';
  try { await action(); feedback.textContent = '완료되었습니다.'; }
  catch (error) { feedback.textContent = error.message; feedback.focus(); }
  finally { busy = false; for (const node of document.querySelectorAll('button, select, input')) node.disabled = false; updateControls(); }
}
function option(value, text) { const el = document.createElement('option'); el.value = value; el.textContent = text; return el; }
function fillConnections(preferred) {
  const profile = selectedProfile();
  $('connection-select').replaceChildren(option('', '네트워크를 선택하세요'), ...connections.filter(c => c.profile_id === profile?.id).map(c => option(c.id, `${c.name} · ${c.tailnet}`)));
  const available = connections.filter(c => c.profile_id === profile?.id);
  if (available.some(c => c.id === preferred)) $('connection-select').value = preferred;
  else if (available.length === 1) $('connection-select').value = available[0].id;
  for (const [id, value] of [['edit-profile-name', profile?.name ?? ''], ['edit-profile-owner', profile?.expected_owner ?? '']]) {
    if ($(id)) $(id).value = value;
  }
  renderConnection();
}
function renderConnection() {
  const c = selectedConnection(), p = selectedProfile();
  for (const [id, value] of [['edit-network-name', c?.name ?? ''], ['replacement-token', ''], ['replacement-expiry', '']]) {
    if ($(id)) $(id).value = value;
  }
  $('connection-info').textContent = c ? `${p.name} → ${c.name}\nTailnet: ${c.tailnet}\n예상 소유자: ${p.expected_owner} (관리자 입력·미검증)\n토큰 저장: ${new Date(c.token_saved_at).toLocaleString('ko-KR')}\n토큰 만료 예정: ${c.token_expires_on ?? '알 수 없음'}${c.token_expires_on ? ' (관리자 입력)' : ''}\n마지막 검증: ${new Date(c.verified_at).toLocaleString('ko-KR')} · ${c.verification_result === 'success' ? '키 목록 접근 성공 · 소유자/발급 권한 미검증' : c.verification_result}` : '먼저 계정 프로필과 네트워크를 선택해 주세요.';
  updateControls();
}
async function refresh(profileId = $('profile-select').value, connectionId = $('connection-select').value) {
  [profiles, connections] = await Promise.all([api('profiles'), api('connections')]);
  $('profile-select').replaceChildren(option('', '계정을 선택하세요'), ...profiles.map(p => option(p.id, p.name)));
  if (profiles.some(p => p.id === profileId)) $('profile-select').value = profileId;
  else if (profiles.length === 1) $('profile-select').value = profiles[0].id;
  fillConnections(connectionId);
}
function updateControls() {
  const p = selectedProfile(), c = selectedConnection();
  const available = connections.filter(item => item.profile_id === p?.id);
  $('profile-select').disabled = busy || !profiles.length;
  $('connection-select').disabled = busy || !p || !available.length;
  if ($('issue-button')) $('issue-button').disabled = busy || !c;
  for (const [id, allowed] of [['profile-edit', !!p], ['connection-form', !!p], ['connection-edit', !!c]]) {
    for (const input of $(id)?.querySelectorAll('input, button') ?? []) input.disabled = busy || !allowed;
  }
  for (const id of ['verify', 'delete-connection']) if ($(id)) $(id).disabled = busy || !c;
  const message = !profiles.length ? '먼저 계정 프로필을 추가한 뒤 Tailscale API 토큰으로 네트워크를 등록하세요.'
    : !p ? '관리하거나 발급할 계정 프로필을 선택하세요.'
    : !available.length ? '이 계정에는 등록된 네트워크가 없습니다. 계정·네트워크 관리에서 API 토큰을 등록하세요.' : '';
  $('empty-guidance').textContent = message;
  $('empty-guidance').hidden = !message;
  const query = new URLSearchParams();
  if (p) query.set('profile', p.id);
  if (c) query.set('connection', c.id);
  const suffix = query.size ? `?${query}` : '';
  $('manage-link').href = `/connections${suffix}`;
  $('manage-link').hidden = !!$('connection-form');
  for (const link of document.querySelectorAll('.app-nav a')) link.href = `${new URL(link.href).pathname}${suffix}`;
  if ($('issue-link')) { $('issue-link').hidden = !c; $('issue-link').href = `/${suffix}`; }
  if (!profiles.length && $('add-profile')) $('add-profile').open = true;
  if (p && !available.length && $('add-network')) $('add-network').open = true;
}
function requireProfile() { const p = selectedProfile(); if (!p) throw new Error('계정 프로필을 먼저 선택해 주세요.'); return p; }
function requireConnection() { const c = selectedConnection(); if (!c) throw new Error('네트워크를 먼저 선택해 주세요.'); return c; }
function bindForm(id, action) {
  const target = $(id);
  if (!target) return;
  const feedback = document.createElement('p');
  feedback.className = 'form-feedback'; feedback.setAttribute('role', 'status'); feedback.tabIndex = -1; target.append(feedback);
  target.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget, values = data(form);
    // 요청을 보내기 전에 비밀 입력을 지운다. 실패하더라도 자동 재전송하지 않는다.
    for (const input of form.querySelectorAll('input[type=password]')) input.value = '';
    void run(() => action(values, form), feedback);
  });
}
$('profile-select').addEventListener('change', () => { clearResult(); clearTokens(); fillConnections(); });
$('connection-select').addEventListener('change', () => { clearResult(); clearTokens(); renderConnection(); });
bindForm('profile-form', async (values, form) => { const p = await api('profiles', 'POST', values); form.reset(); $('add-profile').open = false; await refresh(p.id); });
bindForm('profile-edit', async values => { await api(`profiles/${requireProfile().id}`, 'PATCH', values); await refresh(); });
bindForm('connection-form', async (values, form) => { const p = requireProfile(); const c = await api('connections', 'POST', { ...values, profile_id: p.id }); form.reset(); $('add-network').open = false; await refresh(p.id, c.id); });
bindForm('connection-edit', async values => { clearResult(); const c = requireConnection(); if (!values.token) { delete values.token; delete values.token_expires_on; } await api(`connections/${c.id}`, 'PATCH', values); await refresh(); });
bindForm('issue-form', async () => {
  const c = requireConnection(), p = requireProfile(); clearResult();
  const epoch = resultEpoch;
  const key = await api(`connections/${c.id}/issue`, 'POST');
  // 사용자가 다른 화면으로 이동했다면 늦게 도착한 비밀을 표시하지 않는다.
  if (document.visibilityState === 'hidden' || epoch !== resultEpoch) return;
  $('result-key').value = key.key;
  $('result-context').textContent = `${p.name} → ${c.name} · ${key.tailnet}\n예상 소유자: ${p.expected_owner} (관리자 입력·미검증)`;
  $('result-expiry').textContent = `만료: ${new Date(key.expires).toLocaleString('ko-KR')} · 일회용·사전 승인·비임시·태그 없음`;
  $('result').hidden = false; $('result-key').focus();
});
$('copy')?.addEventListener('click', () => { void (async () => { try { await navigator.clipboard.writeText($('result-key').value); notice('복사했습니다. 비공개 경로로 직접 전달해 주세요.'); } catch { $('result-key').focus(); $('result-key').select(); notice('자동 복사를 사용할 수 없습니다. 선택한 키를 직접 복사해 주세요.'); } })(); });
$('clear')?.addEventListener('click', clearResult);
$('verify')?.addEventListener('click', () => { void run(async () => { await api(`connections/${requireConnection().id}/verify`, 'POST'); await refresh(); }, $('connection-edit').querySelector('.form-feedback')); });
$('delete-connection')?.addEventListener('click', () => { void run(async () => { const c = requireConnection(); if (!confirm(`${c.name} 연결을 삭제할까요? 기존 키·기기는 남습니다. API 토큰은 Tailscale에서 별도로 폐기하세요.`)) return; clearResult(); await api(`connections/${c.id}`, 'DELETE'); await refresh(); }); });
$('delete-profile')?.addEventListener('click', () => { void run(async () => { const p = requireProfile(); if (!confirm(`${p.name}과 소속 연결을 모두 삭제할까요? 기존 키·기기는 남습니다. API 토큰은 Tailscale에서 별도로 폐기하세요.`)) return; clearResult(); await api(`profiles/${p.id}`, 'DELETE'); await refresh(); }); });
$('audit-details')?.addEventListener('toggle', () => {
  if (!$('audit-details').open) return;
  void run(async () => {
    const rows = await api('audit');
    $('audit').replaceChildren(...rows.map(row => { const li = document.createElement('li'); li.textContent = `${new Date(row.requested_at).toLocaleString('ko-KR')} · ${row.actor}\n연결 ${row.connection_id} · ${row.outcome}\n키 ID ${row.key_id ?? '없음'} · 만료 ${row.expires_at ?? '알 수 없음'}`; return li; }));
  });
});
function onlineState() { $('offline').hidden = navigator.onLine; }
window.addEventListener('offline', onlineState); window.addEventListener('online', onlineState);
window.addEventListener('pagehide', () => { clearResult(); clearTokens(); });
window.addEventListener('pageshow', () => { clearResult(); clearTokens(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') clearResult(); });
onlineState();
const initialSelection = new URLSearchParams(location.search);
void run(async () => { const session = await api('session'); $('identity').textContent = `관리자 · ${session.actor}`; await refresh(initialSelection.get('profile'), initialSelection.get('connection')); });

$('reencrypt')?.addEventListener('click', () => { void run(async () => { if (!confirm('기존 키·새 키 설정과 백업을 완료했나요? 저장된 토큰을 현재 키로 재암호화합니다.')) return; await api('reencrypt', 'POST'); }); });
