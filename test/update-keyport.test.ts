import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/update-keyport.sh');
function fixture(run: (dir: string, git: (...args: string[]) => string, base: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'keyport-update-'));
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(['git', ...args], { cwd: dir });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  try {
    git('init', '-b', 'upstream');
    git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
    writeFileSync(join(dir, 'app.txt'), 'old\n');
    writeFileSync(join(dir, 'config.txt'), 'name=keyport\ndatabase=\nkeep=1\nkeep=2\nkeep=3\nkeep=4\nfeature=old\n');
    git('add', '.'); git('commit', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    run(dir, git, base);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function update(dir: string, target: string) {
  return Bun.spawnSync(['bash', script, target], { cwd: dir });
}

test('updater preserves deployment settings, merges upstream config, and is repeatable', () => {
  fixture((dir, git, base) => {
    writeFileSync(join(dir, 'app.txt'), 'new\n');
    writeFileSync(join(dir, 'config.txt'), 'name=keyport\ndatabase=\nkeep=1\nkeep=2\nkeep=3\nkeep=4\nfeature=new\n');
    git('add', '.'); git('commit', '-m', 'upstream change');
    const target = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'deployment', base);
    writeFileSync(join(dir, '.keyport-upstream'), `${base}\n`);
    writeFileSync(join(dir, 'config.txt'), 'name=keyport\ndatabase=production-id\nkeep=1\nkeep=2\nkeep=3\nkeep=4\nfeature=old\n');
    git('add', '.'); git('commit', '-m', 'deployment config');
    expect(update(dir, target).exitCode).toBe(0);
    expect(readFileSync(join(dir, 'config.txt'), 'utf8')).toContain('database=production-id\nkeep=1\nkeep=2\nkeep=3\nkeep=4\nfeature=new');
    expect(readFileSync(join(dir, 'app.txt'), 'utf8')).toBe('new\n');
    git('commit', '-m', 'update');
    expect(update(dir, target).exitCode).toBe(0);
    expect(git('status', '--porcelain')).toBe('');
  });
});

test('updater rejects conflicts and dirty working trees without moving HEAD', () => {
  fixture((dir, git, base) => {
    writeFileSync(join(dir, 'app.txt'), 'upstream\n');
    git('add', '.'); git('commit', '-m', 'upstream');
    const target = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'deployment', base);
    writeFileSync(join(dir, '.keyport-upstream'), `${base}\n`);
    writeFileSync(join(dir, 'app.txt'), 'custom\n');
    git('add', '.'); git('commit', '-m', 'custom');
    const head = git('rev-parse', 'HEAD');
    expect(update(dir, target).exitCode).not.toBe(0);
    expect(git('rev-parse', 'HEAD')).toBe(head);
    git('reset', '--hard', 'HEAD');
    writeFileSync(join(dir, 'app.txt'), 'uncommitted\n');
    expect(update(dir, target).exitCode).not.toBe(0);
    expect(readFileSync(join(dir, 'app.txt'), 'utf8')).toBe('uncommitted\n');
  });
});

test('a fresh template import can advance its baseline without replaying installed changes', () => {
  fixture((dir, git, base) => {
    writeFileSync(join(dir, 'app.txt'), 'new\n');
    writeFileSync(join(dir, 'added.txt'), 'installed\n');
    git('add', '.'); git('commit', '-m', 'upstream');
    const target = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, '.keyport-upstream'), `${base}\n`);
    git('add', '.'); git('commit', '-m', 'import');
    expect(update(dir, target).exitCode).toBe(0);
    expect(readFileSync(join(dir, 'app.txt'), 'utf8')).toBe('new\n');
    expect(readFileSync(join(dir, '.keyport-upstream'), 'utf8')).toBe(`${target}\n`);
  });
});
