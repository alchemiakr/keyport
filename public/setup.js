const $ = id => document.getElementById(id);
let key = '', settings = null, backedUp = false;
$('origin').value = location.origin;
const status = text => { $('setup-status').textContent = text; };
function resetSettings() { settings = null; $('settings').replaceChildren(); }
for (const id of ['origin', 'team', 'aud', 'admins']) $(id).addEventListener('input', resetSettings);
$('generate').addEventListener('click', () => {
  if (!$('new-install').checked) return status('기존 데이터가 없는 새 설치임을 확인해 주세요.');
  if (key && !confirm('아직 저장하지 않은 키를 새로 생성할까요? 이전 복구 파일의 키와 달라집니다.')) return;
  key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  backedUp = false; resetSettings(); $('backup').disabled = false;
  status('새 암호화 키를 생성했습니다. 먼저 복구 파일을 다운로드하세요.');
});
$('backup').addEventListener('click', () => {
  if (!key) return;
  const blob = new Blob([JSON.stringify({ warning: '비밀 복구 파일입니다. 암호화된 보관함에 저장하세요.', app_origin: $('origin').value, TOKEN_ENCRYPTION_KEY: key, created_at: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `keyport-recovery-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backedUp = true; status('복구 파일 다운로드를 요청했습니다. 파일이 실제로 저장되었는지 확인한 뒤 암호화된 보관함으로 옮기세요.');
});
$('prepare').addEventListener('click', () => {
  try {
    const origin = new URL($('origin').value.trim());
    if (origin.protocol !== 'https:' || origin.origin !== $('origin').value.trim()) throw new Error('앱 URL은 경로 없는 HTTPS origin이어야 합니다.');
    const team = $('team').value.trim();
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) throw new Error('팀 도메인을 확인해 주세요. https:// 없이 입력합니다.');
    const aud = $('aud').value.trim();
    if (!/^[a-f0-9]{64}$/.test(aud)) throw new Error('Access AUD는 64자리 16진수 값이어야 합니다.');
    const admins = $('admins').value.split(',').map(s => s.trim().toLowerCase());
    if (!admins.length || admins.some(s => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(s))) throw new Error('실제 관리자 이메일을 쉼표로 구분해 입력하세요.');
    if (!key || !backedUp) throw new Error('암호화 키 생성과 복구 파일 다운로드를 먼저 진행하세요.');
    settings = { APP_ORIGIN: origin.origin, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud, ADMIN_EMAILS: admins.join(','), TOKEN_ENCRYPTION_KEY: key };
    $('settings').replaceChildren(...Object.entries(settings).map(([name, value]) => {
      const div = document.createElement('div'), label = document.createElement('label'), input = document.createElement('input'), button = document.createElement('button');
      label.htmlFor = `setting-${name}`; label.textContent = name;
      input.id = label.htmlFor; input.readOnly = true; input.type = name === 'TOKEN_ENCRYPTION_KEY' ? 'password' : 'text'; input.value = value; input.autocomplete = 'off';
      button.type = 'button'; button.className = 'secondary'; button.textContent = `${name} 값 복사`;
      button.addEventListener('click', async () => { try { await navigator.clipboard.writeText(value); status(`${name} 값을 복사했습니다. Cloudflare의 같은 이름 Secret에 붙여넣으세요.`); } catch { input.focus(); input.select(); status('복사를 사용할 수 없습니다. 입력값을 직접 선택해 복사해 주세요.'); } });
      div.append(label, input, button); return div;
    }));
    $('open-app').href = origin.origin; status('다섯 항목을 Secret으로 저장한 뒤 Deploy를 누르세요.');
  } catch (error) { status(error.message); }
});
window.addEventListener('pagehide', () => { key = ''; resetSettings(); });
