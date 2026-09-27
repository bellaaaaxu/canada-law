// Turn "install for these tools" into a list of concrete actions, without touching anything, so the user can
// preview exactly what will change (--print) before it happens.
import { join } from 'node:path';
import type { InstallEnv } from './env.js';
import { planJsonAdd, planJsonRemove } from './json-config.js';
import { planTomlAdd, planTomlRemove } from './toml-config.js';
import { TOOLS, type Tool } from './tools.js';

export const SKILL_NAME = 'canada-employment-law';
export const stableDir = (env: InstallEnv) => join(env.home, '.canada-law');
export const serverPathFor = (env: InstallEnv) => join(stableDir(env), 'canada-law-mcp.mjs');
export const statePathFor = (env: InstallEnv) => join(stableDir(env), 'install-state.json');

/** What has been installed, so status and uninstall know what to look at. */
export type InstallState = { version: 1; tools: string[] };

export type Action =
  | { type: 'copy-file'; from: string; to: string }
  | { type: 'copy-dir'; from: string; to: string; tools: string[] }
  | { type: 'write-file'; tool: string; file: string; next: string; status: 'create' | 'update' | 'remove'; backup: boolean }
  | { type: 'remove-dir'; path: string; tools: string[] }
  | { type: 'unchanged'; tool: string; file: string }
  | { type: 'command'; tool: string; exe: string; args: string[]; ignoreFailure: boolean }
  | { type: 'manual'; tool: string; text: string }
  | { type: 'write-state'; file: string; state: InstallState };

export function toolsById(ids: string[]): Tool[] {
  return ids.map((id) => {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) throw new Error(`Unknown tool "${id}". Known tools: ${TOOLS.map((t) => t.id).join(', ')}`);
    return tool;
  });
}

export const detectTools = (env: InstallEnv): Tool[] => TOOLS.filter((t) => t.detect(env));

export type PlanOptions = { pkgRoot: string; read: (file: string) => string | null; previous?: InstallState };

export function planInstall(ids: string[], env: InstallEnv, opts: PlanOptions): Action[] {
  const tools = toolsById(ids);
  const server = serverPathFor(env);
  const actions: Action[] = [{ type: 'copy-file', from: join(opts.pkgRoot, 'mcp', 'canada-law-mcp.mjs'), to: server }];

  const toolsByFolder = new Map<string, string[]>();
  for (const t of tools) for (const dir of t.skillDirs(env)) toolsByFolder.set(dir, [...(toolsByFolder.get(dir) ?? []), t.id]);
  for (const [dir, ids] of toolsByFolder) {
    actions.push({ type: 'copy-dir', from: join(opts.pkgRoot, 'skills', SKILL_NAME), to: join(dir, SKILL_NAME), tools: ids });
  }

  for (const t of tools) {
    const m = t.mcp(env, server);
    if (m.kind === 'json' || m.kind === 'toml') {
      const current = opts.read(m.file);
      const p = m.kind === 'json' ? planJsonAdd(current, m.format, server) : planTomlAdd(current, server);
      if (p.status === 'unchanged') actions.push({ type: 'unchanged', tool: t.id, file: m.file });
      else if (p.status === 'unparseable') {
        actions.push({ type: 'manual', tool: t.id, text: `${m.file} could not be read, so it was left untouched. Add a server named canada-law that runs: node "${server}"` });
      } else actions.push({ type: 'write-file', tool: t.id, file: m.file, next: p.next!, status: p.status, backup: current !== null });
    } else if (m.kind === 'command') {
      actions.push({ type: 'command', tool: t.id, exe: m.exe, args: m.remove, ignoreFailure: true });
      actions.push({ type: 'command', tool: t.id, exe: m.exe, args: m.add, ignoreFailure: false });
    } else actions.push({ type: 'manual', tool: t.id, text: m.text });
  }

  const installed = [...new Set([...(opts.previous?.tools ?? []), ...ids])];
  actions.push({ type: 'write-state', file: statePathFor(env), state: { version: 1, tools: installed } });
  return actions;
}

/** Undo what planInstall did, for the given tools (null = everything recorded as installed). */
export function planUninstall(ids: string[] | null, env: InstallEnv, opts: { read: (file: string) => string | null; state: InstallState | null }): Action[] {
  const installed = opts.state?.tools ?? [];
  const targets = toolsById(ids ?? installed);
  const remaining = toolsById(installed.filter((id) => !targets.some((t) => t.id === id)));
  const server = serverPathFor(env);
  const actions: Action[] = [];

  for (const t of targets) {
    const m = t.mcp(env, server);
    if (m.kind === 'json' || m.kind === 'toml') {
      const current = opts.read(m.file);
      const p = m.kind === 'json' ? planJsonRemove(current, m.format) : planTomlRemove(current);
      if (p.status === 'remove') actions.push({ type: 'write-file', tool: t.id, file: m.file, next: p.next!, status: 'remove', backup: true });
      else if (p.status === 'unparseable') actions.push({ type: 'manual', tool: t.id, text: `${m.file} could not be read; remove the canada-law server from it by hand.` });
    } else if (m.kind === 'command') {
      actions.push({ type: 'command', tool: t.id, exe: m.exe, args: m.remove, ignoreFailure: true });
    } else {
      actions.push({ type: 'manual', tool: t.id, text: `If you added the canada-law MCP server to ${t.name} by hand, remove it in ${t.name}'s settings.` });
    }
  }

  // A skill folder can be shared (~/.agents/skills): keep it while any remaining tool reads it.
  const stillUsed = new Set(remaining.flatMap((t) => t.skillDirs(env)));
  const toolsByFolder = new Map<string, string[]>();
  for (const t of targets) for (const dir of t.skillDirs(env)) if (!stillUsed.has(dir)) toolsByFolder.set(dir, [...(toolsByFolder.get(dir) ?? []), t.id]);
  for (const [dir, ids] of toolsByFolder) actions.push({ type: 'remove-dir', path: join(dir, SKILL_NAME), tools: ids });

  if (remaining.length === 0) actions.push({ type: 'remove-dir', path: stableDir(env), tools: [] });
  else actions.push({ type: 'write-state', file: statePathFor(env), state: { version: 1, tools: remaining.map((t) => t.id) } });
  return actions;
}
