import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyActions, readState, realIo } from '../../src/install/apply.js';
import type { InstallEnv } from '../../src/install/env.js';
import { planInstall, planUninstall, serverPathFor, type Action } from '../../src/install/plan.js';

let base = '';
let home = '';
let pkg = '';
const env = (): InstallEnv => ({ home, appData: join(home, 'AppData', 'Roaming'), localAppData: join(home, 'AppData', 'Local'), platform: 'win32', which: () => null });
const io = realIo();
const read = (f: string) => io.read(f);
const put = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const at = (...p: string[]) => join(home, ...p);
const backups = (dir: string) => readdirSync(dir).filter((f) => f.includes('.bak-canada-law-'));
const install = (ids: string[]) => applyActions(planInstall(ids, env(), { pkgRoot: pkg, read, previous: readState(env(), io) ?? undefined }), io);
const uninstall = (ids: string[] | null) => applyActions(planUninstall(ids, env(), { read, state: readState(env(), io) }), io);

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'apply-'));
  home = join(base, '张三'); // Chinese user name: the path that broke fs.cpSync
  pkg = join(base, 'pkg');
  put(join(pkg, 'mcp', 'canada-law-mcp.mjs'), '// server');
  put(join(pkg, 'skills', 'canada-employment-law', 'SKILL.md'), '---\nname: canada-employment-law\n---\n');
  put(join(pkg, 'skills', 'canada-employment-law', 'scripts', 'bclaw.mjs'), '// script');
  put(at('.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { mine: { command: 'x', args: [] } } }));
  put(at('.codex', 'config.toml'), 'model = "o5"\n');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('install', () => {
  it('installs for Codex, Cursor and Kiro, keeping the user’s own settings and backing them up', () => {
    const outcomes = install(['codex', 'cursor', 'kiro']);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);

    expect(readFileSync(serverPathFor(env()), 'utf8')).toBe('// server');
    expect(existsSync(at('.agents', 'skills', 'canada-employment-law', 'scripts', 'bclaw.mjs'))).toBe(true);
    expect(existsSync(at('.kiro', 'skills', 'canada-employment-law', 'SKILL.md'))).toBe(true);

    const cursor = JSON.parse(readFileSync(at('.cursor', 'mcp.json'), 'utf8'));
    expect(Object.keys(cursor.mcpServers)).toEqual(['mine', 'canada-law']);
    expect(backups(at('.cursor'))).toHaveLength(1);

    const codex = readFileSync(at('.codex', 'config.toml'), 'utf8');
    expect(codex.startsWith('model = "o5"\n')).toBe(true);
    expect(codex).toContain('[mcp_servers.canada-law]');

    expect(JSON.parse(readFileSync(at('.kiro', 'settings', 'mcp.json'), 'utf8')).mcpServers['canada-law'].command).toBe('node');
    expect(readState(env(), io)?.tools).toEqual(['codex', 'cursor', 'kiro']);
  });

  it('changes nothing, and makes no new backup, when run again', () => {
    install(['cursor']);
    const again = install(['cursor']);
    expect(again.some((o) => o.action.type === 'unchanged')).toBe(true);
    expect(backups(at('.cursor'))).toHaveLength(1);
  });
});

describe('uninstall', () => {
  it('removes only what the installer added', () => {
    install(['codex', 'cursor', 'kiro']);
    const outcomes = uninstall(null);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);

    expect(JSON.parse(readFileSync(at('.cursor', 'mcp.json'), 'utf8')).mcpServers).toEqual({ mine: { command: 'x', args: [] } });
    expect(readFileSync(at('.codex', 'config.toml'), 'utf8')).not.toContain('canada-law');
    expect(readFileSync(at('.codex', 'config.toml'), 'utf8')).toContain('model = "o5"');
    expect(existsSync(at('.agents', 'skills', 'canada-employment-law'))).toBe(false);
    expect(existsSync(at('.kiro', 'skills', 'canada-employment-law'))).toBe(false);
    expect(existsSync(at('.canada-law'))).toBe(false);
  });

  it('keeps a shared skill folder that another installed tool still uses', () => {
    install(['codex', 'cursor']);
    uninstall(['cursor']);
    expect(existsSync(at('.agents', 'skills', 'canada-employment-law'))).toBe(true);
    expect(JSON.parse(readFileSync(at('.cursor', 'mcp.json'), 'utf8')).mcpServers).not.toHaveProperty('canada-law');
    expect(readState(env(), io)?.tools).toEqual(['codex']);
  });

  it('refuses to delete a folder that is not this skill', () => {
    put(at('.kiro', 'skills', 'canada-employment-law', 'SKILL.md'), '---\nname: someone-elses-skill\n---\n');
    const [o] = applyActions([{ type: 'remove-dir', path: at('.kiro', 'skills', 'canada-employment-law'), tools: ['kiro'] }], io);
    expect(o.ok).toBe(false);
    expect(existsSync(at('.kiro', 'skills', 'canada-employment-law', 'SKILL.md'))).toBe(true);
  });
});

describe('applyActions', () => {
  it('never overwrites an earlier backup, even within the same second', () => {
    const frozen = { ...io, now: () => new Date('2026-09-25T10:00:00Z') };
    const file = at('.cursor', 'mcp.json');
    const original = readFileSync(file, 'utf8');
    const write = (next: string): Action => ({ type: 'write-file', tool: 'cursor', file, next, status: 'update', backup: true });
    applyActions([write('{"a":1}\n'), write('{"b":2}\n')], frozen);
    const saved = backups(at('.cursor')).sort();
    expect(saved).toHaveLength(2);
    expect(readFileSync(at('.cursor', saved[0]), 'utf8')).toBe(original);
  });

  it('reports a failing official command with its output instead of hiding it', () => {
    const failing = { ...io, run: () => ({ code: 1, out: 'MCP server canada-law already exists' }) };
    const action: Action = { type: 'command', tool: 'claude-code', exe: 'claude', args: ['mcp', 'add'], ignoreFailure: false };
    const [o] = applyActions([action], failing);
    expect(o.ok).toBe(false);
    expect(o.message).toContain('already exists');
  });
});
