// The AI tools the installer supports, and where each one reads skills and MCP servers.
// Every path comes from the tool's official documentation: docs/research/2026-09-24-各AI工具安装方式.md and
// docs/research/2026-09-25-第二批AI工具安装方式.md. `tested` = checked on a real installation.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { InstallEnv } from './env.js';
import type { JsonFormat } from './json-config.js';

export type McpMethod =
  | { kind: 'json'; file: string; format: JsonFormat }
  | { kind: 'toml'; file: string }
  | { kind: 'command'; exe: string; add: string[]; remove: string[] }
  | { kind: 'manual'; text: string };

export type Tool = {
  id: string;
  name: string;
  tested: boolean;
  detect: (env: InstallEnv) => boolean;
  skillDirs: (env: InstallEnv) => string[];
  mcp: (env: InstallEnv, serverPath: string) => McpMethod;
};

const has = (e: InstallEnv, ...p: string[]) => existsSync(join(e.home, ...p));
const commandOrFolder = (cmd: string, ...folder: string[]) => (e: InstallEnv) => e.which(cmd) !== null || has(e, ...folder);
/** Read by Codex, VS Code / Copilot, Cursor, Gemini CLI, Copilot CLI, OpenCode, Kimi Code and DeepSeek Harness. */
const sharedSkills = (e: InstallEnv) => [join(e.home, '.agents', 'skills')];
const json = (format: JsonFormat, ...p: string[]) => (e: InstallEnv): McpMethod => ({ kind: 'json', file: join(e.home, ...p), format });

// The Microsoft Store (MSIX) build of Claude Desktop reads its config from inside its package folder and ignores the
// file at the documented %APPDATA% path (anthropics/claude-code#26073, #25579; seen on the D3 test machine, 2026-09-25).
const CLAUDE_MSIX = ['Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude'];

function claudeDesktopDir(e: InstallEnv): string | null {
  if (e.platform === 'win32') {
    const msix = e.localAppData ? join(e.localAppData, ...CLAUDE_MSIX) : null;
    if (msix && existsSync(msix)) return msix;
    return e.appData ? join(e.appData, 'Claude') : null;
  }
  if (e.platform === 'darwin') return join(e.home, 'Library', 'Application Support', 'Claude');
  return null;
}

export const TOOLS: Tool[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    tested: true,
    detect: commandOrFolder('claude', '.claude'),
    skillDirs: (e) => [join(e.home, '.claude', 'skills')],
    mcp: (e, server) => {
      const exe = e.which('claude');
      return exe
        ? { kind: 'command', exe, remove: ['mcp', 'remove', 'canada-law', '--scope', 'user'], add: ['mcp', 'add', '--scope', 'user', 'canada-law', '--', 'node', server] }
        : { kind: 'manual', text: `The claude command was not found. Once Claude Code is installed, run: claude mcp add --scope user canada-law -- node "${server}"` };
    },
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    tested: false,
    detect: (e) => {
      const dir = claudeDesktopDir(e);
      return dir !== null && existsSync(dir);
    },
    skillDirs: () => [],
    mcp: (e) => {
      const dir = claudeDesktopDir(e);
      return dir
        ? { kind: 'json', file: join(dir, 'claude_desktop_config.json'), format: 'mcpServers' }
        : { kind: 'manual', text: 'Claude Desktop documents its config file for Windows and macOS only; on Linux, add canada-law by hand (see the README).' };
    },
  },
  { id: 'codex', name: 'OpenAI Codex', tested: false, detect: commandOrFolder('codex', '.codex'), skillDirs: sharedSkills, mcp: (e) => ({ kind: 'toml', file: join(e.home, '.codex', 'config.toml') }) },
  {
    id: 'vscode',
    name: 'VS Code / GitHub Copilot',
    tested: false,
    detect: (e) => e.which('code') !== null,
    skillDirs: sharedSkills,
    mcp: (_e, server) => ({
      kind: 'manual',
      text: `VS Code's user MCP file location is not documented, so run this yourself: code --add-mcp ${JSON.stringify(JSON.stringify({ name: 'canada-law', command: 'node', args: [server] }))}`,
    }),
  },
  { id: 'cursor', name: 'Cursor', tested: false, detect: (e) => has(e, '.cursor'), skillDirs: sharedSkills, mcp: json('mcpServers', '.cursor', 'mcp.json') },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    tested: false,
    detect: (e) => e.which('gemini') !== null || has(e, '.gemini', 'settings.json'),
    skillDirs: sharedSkills,
    mcp: json('mcpServers', '.gemini', 'settings.json'),
  },
  { id: 'copilot-cli', name: 'GitHub Copilot CLI', tested: false, detect: commandOrFolder('copilot', '.copilot'), skillDirs: sharedSkills, mcp: json('copilot', '.copilot', 'mcp-config.json') },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    tested: false,
    detect: (e) => e.which('agy') !== null || has(e, '.gemini', 'config') || has(e, '.gemini', 'antigravity-cli'),
    skillDirs: (e) => [join(e.home, '.gemini', 'config', 'skills'), join(e.home, '.gemini', 'antigravity-cli', 'skills')],
    mcp: json('mcpServers', '.gemini', 'config', 'mcp_config.json'),
  },
  { id: 'kiro', name: 'Kiro', tested: false, detect: commandOrFolder('kiro-cli', '.kiro'), skillDirs: (e) => [join(e.home, '.kiro', 'skills')], mcp: json('mcpServers', '.kiro', 'settings', 'mcp.json') },
  { id: 'qwen-code', name: 'Qwen Code', tested: false, detect: commandOrFolder('qwen', '.qwen'), skillDirs: (e) => [join(e.home, '.qwen', 'skills')], mcp: json('mcpServers', '.qwen', 'settings.json') },
  { id: 'opencode', name: 'OpenCode', tested: false, detect: commandOrFolder('opencode', '.config', 'opencode'), skillDirs: sharedSkills, mcp: json('opencode', '.config', 'opencode', 'opencode.json') },
  { id: 'kimi-code', name: 'Kimi Code CLI', tested: false, detect: commandOrFolder('kimi', '.kimi-code'), skillDirs: sharedSkills, mcp: json('mcpServers', '.kimi-code', 'mcp.json') },
  {
    id: 'cline',
    name: 'Cline',
    tested: false,
    detect: commandOrFolder('cline', '.cline'),
    skillDirs: (e) => [join(e.home, '.cline', 'skills')],
    mcp: (_e, server) => ({
      kind: 'manual',
      text: `Cline's documentation gives three different MCP file locations, so use its own wizard: run "cline mcp" and add a stdio server named canada-law that runs: node "${server}"`,
    }),
  },
  {
    id: 'deepseek-harness',
    name: 'DeepSeek Harness',
    tested: false,
    detect: commandOrFolder('dsh', '.dsh'),
    skillDirs: sharedSkills,
    mcp: () => ({
      kind: 'manual',
      text: 'DeepSeek Harness is a developer preview whose MCP config may change, so only the skill was installed (it works on its own). To add the MCP server, see https://github.com/deepseek-ai/deepseek-harness',
    }),
  },
];
