import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { realIo } from '../../src/install/apply.js';
import type { InstallEnv } from '../../src/install/env.js';
import { runInstaller } from '../../src/install/main.js';

let base = '';
let home = '';
let pkg = '';
const put = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const at = (...p: string[]) => join(home, ...p);
const env = (): InstallEnv => ({ home, appData: join(home, 'AppData', 'Roaming'), localAppData: join(home, 'AppData', 'Local'), platform: 'win32', which: () => null });
const run = (argv: string[], opts: { isTTY?: boolean; answer?: boolean } = {}) =>
  runInstaller(argv, { env: env(), io: realIo(), pkgRoot: pkg, isTTY: opts.isTTY ?? false, ask: async () => opts.answer ?? false });

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'main-'));
  home = join(base, '张三');
  pkg = join(base, 'pkg');
  put(join(pkg, 'mcp', 'canada-law-mcp.mjs'), '// server');
  put(join(pkg, 'skills', 'canada-employment-law', 'SKILL.md'), '---\nname: canada-employment-law\n---\n');
  mkdirSync(at('.cursor'), { recursive: true });
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('canada-law install', () => {
  it('without --yes, in a non-interactive shell, shows the plan and changes nothing', async () => {
    const r = await run(['install']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Cursor/);
    expect(r.out).toMatch(/--yes/);
    expect(existsSync(at('.cursor', 'mcp.json'))).toBe(false);
    expect(existsSync(at('.canada-law'))).toBe(false);
  });

  it('with --print only shows the plan, even in an interactive terminal', async () => {
    const r = await run(['install', '--print'], { isTTY: true, answer: true });
    expect(r.code).toBe(0);
    expect(existsSync(at('.cursor', 'mcp.json'))).toBe(false);
  });

  it('in an interactive terminal, asks before changing anything and respects "no"', async () => {
    await run(['install'], { isTTY: true, answer: false });
    expect(existsSync(at('.cursor', 'mcp.json'))).toBe(false);
    await run(['install'], { isTTY: true, answer: true });
    expect(existsSync(at('.cursor', 'mcp.json'))).toBe(true);
  });

  it('with --yes installs for the detected tools and says what to do next', async () => {
    const r = await run(['install', '--yes']);
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(at('.cursor', 'mcp.json'), 'utf8')).mcpServers).toHaveProperty('canada-law');
    expect(existsSync(at('.agents', 'skills', 'canada-employment-law', 'SKILL.md'))).toBe(true);
    expect(r.out).toMatch(/[Rr]estart/);
  });

  it('installs only the tools named on the command line', async () => {
    mkdirSync(at('.kiro'));
    await run(['install', 'kiro', '--yes']);
    expect(existsSync(at('.kiro', 'settings', 'mcp.json'))).toBe(true);
    expect(existsSync(at('.cursor', 'mcp.json'))).toBe(false);
  });

  it('says so when no supported AI tool is found', async () => {
    rmSync(at('.cursor'), { recursive: true });
    const r = await run(['install', '--yes']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/No supported AI tool/);
  });

  it('rejects an unknown tool name with the list of known ones', async () => {
    const r = await run(['install', 'notepad', '--yes']);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/Unknown tool "notepad"/);
    expect(r.out).toMatch(/cursor/);
  });
});

describe('canada-law uninstall / status / list', () => {
  it('uninstall --yes removes what install added', async () => {
    await run(['install', '--yes']);
    const r = await run(['uninstall', '--yes']);
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(at('.cursor', 'mcp.json'), 'utf8')).mcpServers).toEqual({});
    expect(existsSync(at('.canada-law'))).toBe(false);
  });

  it('status lists what is installed', async () => {
    expect((await run(['status'])).out).toMatch(/Nothing installed/);
    await run(['install', '--yes']);
    const r = await run(['status']);
    expect(r.out).toMatch(/cursor/i);
  });

  it('list shows every supported tool, marking tested ones and detected ones', async () => {
    const r = await run(['list']);
    expect(r.code).toBe(0);
    for (const id of ['claude-code', 'cursor', 'antigravity', 'kimi-code', 'deepseek-harness']) expect(r.out).toContain(id);
    expect(r.out).toMatch(/tested/);
    expect(r.out).toMatch(/cursor.*found/i);
  });

  it('prints help', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Usage/);
  });
});
