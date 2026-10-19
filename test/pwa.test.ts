import { test, expect } from 'bun:test';
import { runInNewContext } from 'node:vm';

const source = await Bun.file('public/pwa.js').text();
class Surface {
  hidden = false;
  open = false;
  matches = false;
  listeners = new Map<string, (event?: any) => unknown>();
  addEventListener(name: string, listener: (event?: any) => unknown) { this.listeners.set(name, listener); }
  emit(name: string, event?: unknown) { return this.listeners.get(name)?.(event); }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
function browser(ios = false, standalone = false) {
  const nodes = new Map(['install-open', 'install-dialog', 'install-ios', 'install-other', 'install-close'].map(id => [id, new Surface()]));
  const window = new Surface(), media = new Surface(); media.matches = standalone;
  runInNewContext(source, { window, navigator: { userAgent: ios ? 'iPhone' : 'Chrome', platform: '', maxTouchPoints: 0 }, matchMedia: () => media, document: { getElementById: (id: string) => nodes.get(id) } });
  return { window, media, node: (id: string) => nodes.get(id)! };
}

test('PWA installation offers native prompt once and manual fallback after dismissal or failure', async () => {
  const b = browser(); let prompted = 0, prevented = 0;
  b.window.emit('beforeinstallprompt', { preventDefault: () => prevented++, prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  await b.node('install-open').emit('click');
  expect(prevented).toBe(1); expect(prompted).toBe(1); expect(b.node('install-dialog').open).toBe(false);
  b.node('install-close').emit('click');
  await b.node('install-open').emit('click');
  expect(prompted).toBe(1); expect(b.node('install-dialog').open).toBe(true);
  b.node('install-close').emit('click');
  b.window.emit('beforeinstallprompt', { preventDefault() {}, prompt: async () => { throw new Error('unavailable'); } });
  await b.node('install-open').emit('click');
  expect(b.node('install-dialog').open).toBe(true);
  b.node('install-close').emit('click');
  b.window.emit('beforeinstallprompt', { preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  await b.node('install-open').emit('click');
  expect(b.node('install-dialog').open).toBe(false);
});

test('PWA shows Safari instructions and hides installation UI in an installed app', async () => {
  const b = browser(true);
  expect(b.node('install-ios').hidden).toBe(false); expect(b.node('install-other').hidden).toBe(true);
  await b.node('install-open').emit('click'); expect(b.node('install-dialog').open).toBe(true);
  b.media.matches = true; b.media.emit('change');
  expect(b.node('install-open').hidden).toBe(true); expect(b.node('install-dialog').open).toBe(false);
  const fresh = browser();
  fresh.window.emit('appinstalled'); fresh.window.emit('pageshow');
  expect(fresh.node('install-open').hidden).toBe(true);
  expect(browser(false, true).node('install-open').hidden).toBe(true);
});
