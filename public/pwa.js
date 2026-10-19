const installButton = document.getElementById('install-open');
const dialog = document.getElementById('install-dialog');
const standalone = matchMedia('(display-mode: standalone)');
let installPrompt, appInstalled = false;
const installed = () => appInstalled || standalone.matches || navigator.standalone === true;
function updateInstallState() {
  installButton.hidden = installed();
  if (installed()) { installPrompt = undefined; if (dialog.open) dialog.close(); }
}
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.getElementById('install-ios').hidden = !ios;
document.getElementById('install-other').hidden = ios;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  updateInstallState();
});
window.addEventListener('appinstalled', () => { appInstalled = true; updateInstallState(); });
standalone.addEventListener('change', updateInstallState);
window.addEventListener('pageshow', updateInstallState);
installButton.addEventListener('click', async () => {
  const prompt = installPrompt;
  installPrompt = undefined;
  if (prompt) {
    try {
      await prompt.prompt();
      await prompt.userChoice;
      return;
    } catch { /* The browser menu remains available if the prompt cannot open. */ }
  }
  if (!dialog.open) dialog.showModal();
});
document.getElementById('install-close').addEventListener('click', () => dialog.close());
updateInstallState();
