const $ = id => document.getElementById(id);
const steps = [...document.querySelectorAll('[data-setup-step]')];
const progress = [...document.querySelectorAll('.setup-progress li')];
let key = '', backedUp = false, currentStep = 0;
$('origin').value = location.origin;
function status(text) {
  $('setup-status').textContent = text;
  $('setup-status').hidden = !text;
}
function showStep(index) {
  currentStep = index;
  steps.forEach((step, i) => { step.hidden = i !== index; });
  progress.forEach((item, i) => {
    if (i === index) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  status('');
  steps[index].querySelector('h2').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function resetSettings() { $('settings').replaceChildren(); }
function accessSettings() {
  const origin = new URL($('origin').value.trim());
  if (origin.protocol !== 'https:' || origin.origin !== $('origin').value.trim()) throw new Error('앱 URL은 경로 없는 HTTPS 주소여야 합니다.');
  const team = $('team').value.trim();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) throw new Error('팀 도메인을 확인해 주세요. https:// 없이 입력합니다.');
  const aud = $('aud').value.trim();
  if (!/^[a-f0-9]{64}$/.test(aud)) throw new Error('Access AUD는 64자리 16진수 값이어야 합니다.');
  const admins = $('admins').value.split(',').map(s => s.trim().toLowerCase());
  if (!admins.length || admins.some(s => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(s))) throw new Error('관리자 이메일을 확인해 주세요. 여러 명이면 쉼표로 구분합니다.');
  return { APP_ORIGIN: origin.origin, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud, ADMIN_EMAILS: admins.join(',') };
}
const edited = new Set();
for (const id of ['origin', 'team', 'aud', 'admins']) $(id).addEventListener('input', () => {
  edited.add(id); resetSettings(); $('confirm-access').checked = false;
});
async function detectAccess() {
  const fallback = '자동으로 채우지 못했습니다. 아래 안내에 따라 Access 앱 정보를 입력하세요.';
  try {
    const response = await fetch('/setup/context', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error();
    const { hints } = await response.json();
    if (currentStep !== 0) return;
    let filled = 0;
    for (const id of ['team', 'aud', 'admins']) {
      if (typeof hints?.[id] === 'string' && !edited.has(id) && !$(id).value) {
        $(id).value = hints[id]; filled++;
      }
    }
    $('access-detection').textContent = filled
      ? '로그인 요청에서 후보를 채웠습니다. 아직 검증·저장되지 않았으니 내용을 확인하세요.' : fallback;
    if (filled) {
      $('access-confirmation').hidden = false;
      $('confirm-access').required = true;
    }
  } catch { $('access-detection').textContent = fallback; }
}
void detectAccess();
$('access-form').addEventListener('submit', event => {
  event.preventDefault();
  try { accessSettings(); showStep(1); }
  catch (error) { status(error.message); }
});
for (const button of document.querySelectorAll('[data-setup-back]')) {
  button.addEventListener('click', () => showStep(currentStep - 1));
}
$('generate').addEventListener('click', () => {
  if (!$('new-install').checked) return status('기존 연결 데이터가 없는 새 설치임을 확인해 주세요.');
  if (key && !confirm('새 키를 다시 만들까요? 이전 복구 파일과 다른 키가 됩니다.')) return;
  key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  backedUp = false; resetSettings(); $('backup').disabled = false;
  status('키를 생성했습니다. 복구 파일을 다운로드하세요.');
});
$('backup').addEventListener('click', () => {
  if (!key) return;
  const blob = new Blob([JSON.stringify({ warning: '비밀 복구 파일입니다. 암호화된 보관함에 저장하세요.', app_origin: $('origin').value, TOKEN_ENCRYPTION_KEY: key, created_at: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `keyport-recovery-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backedUp = true; status('다운로드한 파일을 확인하고 암호화된 보관함에 옮기세요.');
});
$('prepare').addEventListener('click', () => {
  try {
    const settings = { ...accessSettings(), TOKEN_ENCRYPTION_KEY: key };
    if (!key || !backedUp) throw new Error('키를 생성하고 복구 파일을 먼저 다운로드하세요.');
    $('settings').replaceChildren(...Object.entries(settings).map(([name, value]) => {
      const div = document.createElement('div'), label = document.createElement('label'), row = document.createElement('div'), input = document.createElement('input'), button = document.createElement('button');
      label.htmlFor = `setting-${name}`; label.textContent = name;
      input.id = label.htmlFor; input.readOnly = true; input.type = name === 'TOKEN_ENCRYPTION_KEY' ? 'password' : 'text'; input.value = value; input.autocomplete = 'off';
      row.className = 'setup-secret'; button.type = 'button'; button.className = 'secondary setup-copy'; button.textContent = '값 복사'; button.setAttribute('aria-label', `${name} 값 복사`);
      button.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(value); status(`${name} 값을 복사했습니다.`); }
        catch { input.focus(); input.select(); status('값을 선택했습니다. 직접 복사해 주세요.'); }
      });
      row.append(input, button); div.append(label, row); return div;
    }));
    $('open-app').href = settings.APP_ORIGIN;
    showStep(2);
  } catch (error) { status(error.message); }
});
window.addEventListener('pagehide', () => { key = ''; resetSettings(); });
