// npm run smoke:install (after npm run bundle): the installer end to end, in a fake home folder with a Chinese
// name. Isolation is checked before anything runs, and the real config files are fingerprinted before and after:
// on 2026-09-25 a hand-typed test forgot APPDATA and briefly wrote to the real Claude Desktop config.
//
//   npm run smoke:install -- --from <release .tgz URL>   the same, through npx, from a published release
//                                                       (npm's cache is inside the fake home, so it downloads afresh)
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bin = join(root, 'bin', 'canada-law.mjs');
const base = mkdtempSync(join(tmpdir(), 'smoke-install-'));
const home = join(base, '王五'); // Chinese user name
const fakeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  APPDATA: join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: join(home, 'AppData', 'Local'),
  PATH: [join(homedir(), '.local', 'bin'), process.env.PATH ?? ''].join(delimiter), // where the Claude Code installer puts claude.exe
};

// 1. Isolation guard: every place the installer looks must be inside the fake home.
for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'] as const) {
  if (!resolve(fakeEnv[key]!).startsWith(resolve(home))) throw new Error(`${key} is not isolated: ${fakeEnv[key]}`);
}

// 2. Canary: the real files the installer could touch.
const realAppData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
const realLocalAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
const MSIX_CLAUDE = ['Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude']; // Microsoft Store build
const realFiles = [
  join(homedir(), '.claude.json'),
  join(realAppData, 'Claude', 'claude_desktop_config.json'),
  join(realLocalAppData, ...MSIX_CLAUDE, 'claude_desktop_config.json'),
  join(homedir(), '.cursor', 'mcp.json'),
  join(homedir(), '.codex', 'config.toml'),
  join(homedir(), '.kiro', 'settings', 'mcp.json'),
  join(homedir(), '.gemini', 'settings.json'),
];
const realDirs = [join(homedir(), '.agents', 'skills', 'canada-employment-law'), join(homedir(), '.claude', 'skills', 'canada-employment-law'), join(homedir(), '.canada-law')];
const fingerprint = () =>
  [...realFiles.map((f) => `${f}=${existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16) : 'absent'}`), ...realDirs.map((d) => `${d}=${existsSync(d)}`)].join('\n');
const before = fingerprint();

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};
const put = (file: string, text: string) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
};
const fromAt = process.argv.indexOf('--from');
const from = fromAt >= 0 ? process.argv[fromAt + 1] : null;
if (fromAt >= 0 && !/^https:\/\/\S+\.tgz$/.test(from ?? '')) throw new Error('--from takes the https URL of a release .tgz');
const run = (...args: string[]) =>
  from
    ? spawnSync(`npx --yes ${from} ${args.join(' ')}`, { env: fakeEnv, encoding: 'utf8', shell: true })
    : spawnSync(process.execPath, [bin, ...args], { env: fakeEnv, encoding: 'utf8' });
if (from) console.log(`installer from ${from}`);
const json = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const at = (...p: string[]) => join(home, ...p);

try {
  // The user's own settings, which must survive install + uninstall.
  put(at('.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { mine: { command: 'x' } } }));
  put(at('.codex', 'config.toml'), 'model = "o5"\n');
  mkdirSync(at('.kiro'));
  // Claude Desktop from the Microsoft Store: it reads the file in its package folder, not the documented one.
  const desktopDocumented = at('AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  const desktopMsix = at('AppData', 'Local', ...MSIX_CLAUDE, 'claude_desktop_config.json');
  put(desktopDocumented, JSON.stringify({ preferences: { sidebarMode: 'documented' } }));
  put(desktopMsix, JSON.stringify({ preferences: { sidebarMode: 'x' } }));
  mkdirSync(at('.claude'));
  const hasClaude = spawnSync('claude', ['--version'], { env: fakeEnv, shell: process.platform === 'win32' }).status === 0;

  const inst = run('install', '--yes');
  check('install exits 0', inst.status === 0, inst.status === 0 ? '' : inst.stdout + inst.stderr);
  check('Cursor: ours added, the user’s kept', Object.keys(json(at('.cursor', 'mcp.json')).mcpServers).join() === 'mine,canada-law');
  check('Codex: our table added, the rest kept', /^model = "o5"\n[\s\S]*\[mcp_servers\.canada-law\]/.test(readFileSync(at('.codex', 'config.toml'), 'utf8')));
  check('Kiro: config created', json(at('.kiro', 'settings', 'mcp.json')).mcpServers['canada-law']?.command === 'node');
  check(
    'Claude Desktop (Microsoft Store): ours added to the file it reads, preferences kept',
    json(desktopMsix).mcpServers?.['canada-law']?.command === 'node' && json(desktopMsix).preferences?.sidebarMode === 'x',
  );
  check('Claude Desktop (Microsoft Store): the documented-path file it ignores is left alone', readFileSync(desktopDocumented, 'utf8') === JSON.stringify({ preferences: { sidebarMode: 'documented' } }));
  check('skills copied', ['.agents', '.claude', '.kiro'].every((d) => existsSync(at(d, 'skills', 'canada-employment-law', 'scripts', 'bclaw.mjs'))));
  if (hasClaude) {
    const list = execFileSync('claude', ['mcp', 'list'], { env: fakeEnv, encoding: 'utf8', shell: process.platform === 'win32' });
    check('Claude Code: canada-law connected (real claude command)', /canada-law:.*Connected/.test(list));
  } else console.log('SKIP  Claude Code command not found');

  const again = run('install', '--yes');
  check('second install changes nothing', /already up to date/.test(again.stdout) && !/\[FAILED\]/.test(again.stdout));

  const un = run('uninstall', '--yes');
  check('uninstall exits 0', un.status === 0, un.status === 0 ? '' : un.stdout + un.stderr);
  check('Cursor: only ours removed', JSON.stringify(json(at('.cursor', 'mcp.json')).mcpServers) === '{"mine":{"command":"x"}}');
  check('Codex: our table removed', !readFileSync(at('.codex', 'config.toml'), 'utf8').includes('canada-law'));
  check('Claude Desktop (Microsoft Store): ours removed, preferences kept', !json(desktopMsix).mcpServers?.['canada-law'] && json(desktopMsix).preferences?.sidebarMode === 'x');
  check('skills and ~/.canada-law removed', !['.agents', '.claude', '.kiro'].some((d) => existsSync(at(d, 'skills', 'canada-employment-law'))) && !existsSync(at('.canada-law')));
} finally {
  const after = fingerprint();
  check('REAL config files untouched', before === after, before === after ? '' : `\nbefore:\n${before}\nafter:\n${after}`);
  rmSync(base, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll installer checks passed.');
process.exit(failed ? 1 : 0);
