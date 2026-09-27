import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InstallEnv } from '../../src/install/env.js';
import { detectTools, planInstall, planUninstall, type Action } from '../../src/install/plan.js';
import { TOOLS } from '../../src/install/tools.js';

let home = '';
let appData = '';
let localAppData = '';
const PKG = 'C:/pkg';
const env = (over: Partial<InstallEnv> = {}): InstallEnv => ({ home, appData, localAppData, platform: 'win32', which: () => null, ...over });
/** Where the Microsoft Store (MSIX) build of Claude Desktop keeps what it thinks is %APPDATA%\Claude. */
const msixClaude = () => join(localAppData, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude');
const server = () => join(home, '.canada-law', 'canada-law-mcp.mjs');
const ofType = <T extends Action['type']>(actions: Action[], type: T) => actions.filter((a): a is Extract<Action, { type: T }> => a.type === type);

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), '张三-home-'));
  appData = join(home, 'AppData', 'Roaming');
  localAppData = join(home, 'AppData', 'Local');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('TOOLS', () => {
  it('covers the 14 tools agreed in the spec, with unique ids', () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      'claude-code', 'claude-desktop', 'codex', 'vscode', 'cursor', 'gemini-cli', 'copilot-cli',
      'antigravity', 'kiro', 'qwen-code', 'opencode', 'kimi-code', 'cline', 'deepseek-harness',
    ]);
  });
});

describe('detectTools', () => {
  it('finds tools by their config folders or commands', () => {
    for (const d of ['.cursor', '.codex', '.kiro']) mkdirSync(join(home, d));
    mkdirSync(join(appData, 'Claude'), { recursive: true });
    const found = detectTools(env({ which: (c) => (c === 'qwen' ? 'C:/bin/qwen.cmd' : null) })).map((t) => t.id);
    expect(found).toEqual(['claude-desktop', 'codex', 'cursor', 'kiro', 'qwen-code']);
  });

  it('finds the Microsoft Store (MSIX) Claude Desktop by its package folder alone', () => {
    mkdirSync(msixClaude(), { recursive: true });
    expect(detectTools(env()).map((t) => t.id)).toEqual(['claude-desktop']);
  });
});

describe('planInstall', () => {
  it('copies the server once, the skill once per folder, and writes each tool’s config', () => {
    const actions = planInstall(['codex', 'cursor', 'kiro'], env(), { pkgRoot: PKG, read: () => null });
    expect(ofType(actions, 'copy-file')).toEqual([{ type: 'copy-file', from: join(PKG, 'mcp', 'canada-law-mcp.mjs'), to: server() }]);
    expect(ofType(actions, 'copy-dir').map((a) => [a.to, a.tools])).toEqual([
      [join(home, '.agents', 'skills', 'canada-employment-law'), ['codex', 'cursor']],
      [join(home, '.kiro', 'skills', 'canada-employment-law'), ['kiro']],
    ]);
    expect(ofType(actions, 'write-file').map((a) => [a.tool, a.file, a.status])).toEqual([
      ['codex', join(home, '.codex', 'config.toml'), 'create'],
      ['cursor', join(home, '.cursor', 'mcp.json'), 'create'],
      ['kiro', join(home, '.kiro', 'settings', 'mcp.json'), 'create'],
    ]);
    expect(actions.at(-1)?.type).toBe('write-state');
  });

  it('merges into an existing config and asks for a backup', () => {
    const cursorFile = join(home, '.cursor', 'mcp.json');
    const read = (f: string) => (f === cursorFile ? JSON.stringify({ mcpServers: { mine: { command: 'x' } } }) : null);
    const [w] = ofType(planInstall(['cursor'], env(), { pkgRoot: PKG, read }), 'write-file');
    expect(w).toMatchObject({ status: 'update', backup: true });
    expect(Object.keys(JSON.parse(w.next).mcpServers)).toEqual(['mine', 'canada-law']);
  });

  it('leaves an unreadable config alone and gives a manual instruction instead', () => {
    const read = (f: string) => (f.endsWith('mcp.json') ? '{ broken' : null);
    const actions = planInstall(['cursor'], env(), { pkgRoot: PKG, read });
    expect(ofType(actions, 'write-file')).toEqual([]);
    expect(ofType(actions, 'manual')[0].text).toMatch(/mcp\.json/);
  });

  it('reports unchanged when our entry is already there', () => {
    const cursorFile = join(home, '.cursor', 'mcp.json');
    const read = (f: string) => (f === cursorFile ? JSON.stringify({ mcpServers: { 'canada-law': { command: 'node', args: [server()] } } }) : null);
    expect(ofType(planInstall(['cursor'], env(), { pkgRoot: PKG, read }), 'unchanged')).toHaveLength(1);
  });

  it('uses the official command for Claude Code when it is installed, and explains how when it is not', () => {
    const withCli = planInstall(['claude-code'], env({ which: (c) => (c === 'claude' ? 'C:/bin/claude.exe' : null) }), { pkgRoot: PKG, read: () => null });
    expect(ofType(withCli, 'command').map((a) => a.args)).toEqual([
      ['mcp', 'remove', 'canada-law', '--scope', 'user'],
      ['mcp', 'add', '--scope', 'user', 'canada-law', '--', 'node', server()],
    ]);
    expect(ofType(withCli, 'copy-dir')[0].to).toBe(join(home, '.claude', 'skills', 'canada-employment-law'));
    const without = planInstall(['claude-code'], env(), { pkgRoot: PKG, read: () => null });
    expect(ofType(without, 'manual')[0].text).toContain('claude mcp add --scope user canada-law -- node');
  });

  it('writes Claude Desktop’s config under %APPDATA% on Windows and ~/Library on macOS, and skips it on Linux', () => {
    const win = ofType(planInstall(['claude-desktop'], env(), { pkgRoot: PKG, read: () => null }), 'write-file');
    expect(win[0].file).toBe(join(appData, 'Claude', 'claude_desktop_config.json'));
    const mac = ofType(planInstall(['claude-desktop'], env({ platform: 'darwin' }), { pkgRoot: PKG, read: () => null }), 'write-file');
    expect(mac[0].file).toBe(join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
    const linux = planInstall(['claude-desktop'], env({ platform: 'linux' }), { pkgRoot: PKG, read: () => null });
    expect(ofType(linux, 'write-file')).toEqual([]);
    expect(ofType(linux, 'manual')[0].text).toMatch(/Linux/);
  });

  // The MSIX build ignores a config file at the documented %APPDATA% path (anthropics/claude-code#26073, #25579).
  it('writes the MSIX Claude Desktop’s config inside its package folder, even when %APPDATA%\\Claude exists too', () => {
    mkdirSync(join(appData, 'Claude'), { recursive: true });
    mkdirSync(msixClaude(), { recursive: true });
    const [w] = ofType(planInstall(['claude-desktop'], env(), { pkgRoot: PKG, read: () => null }), 'write-file');
    expect(w.file).toBe(join(msixClaude(), 'claude_desktop_config.json'));
  });

  it('removes our entry from that same MSIX file on uninstall', () => {
    mkdirSync(msixClaude(), { recursive: true });
    const file = join(msixClaude(), 'claude_desktop_config.json');
    const read = (f: string) => (f === file ? JSON.stringify({ mcpServers: { 'canada-law': { command: 'node', args: [server()] } } }) : null);
    const [w] = ofType(planUninstall(['claude-desktop'], env(), { read, state: { version: 1, tools: ['claude-desktop'] } }), 'write-file');
    expect(w).toMatchObject({ file, status: 'remove' });
  });

  it('only installs the skill for Cline and DeepSeek Harness, with a manual MCP note', () => {
    const actions = planInstall(['cline', 'deepseek-harness'], env(), { pkgRoot: PKG, read: () => null });
    expect(ofType(actions, 'copy-dir').map((a) => a.to)).toEqual([
      join(home, '.cline', 'skills', 'canada-employment-law'),
      join(home, '.agents', 'skills', 'canada-employment-law'),
    ]);
    expect(ofType(actions, 'write-file')).toEqual([]);
    expect(ofType(actions, 'manual').map((a) => a.tool)).toEqual(['cline', 'deepseek-harness']);
  });

  it('prints the exact VS Code command instead of running it', () => {
    const [m] = ofType(planInstall(['vscode'], env(), { pkgRoot: PKG, read: () => null }), 'manual');
    expect(m.text).toContain('code --add-mcp');
    expect(m.text).toContain('canada-law');
  });

  it('rejects an unknown tool name', () => {
    expect(() => planInstall(['notepad'], env(), { pkgRoot: PKG, read: () => null })).toThrow(/Unknown tool "notepad"/);
  });
});
