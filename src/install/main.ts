// The installer's commands. Output is bilingual (English first, so it stays readable if Chinese is garbled).
import { basename } from 'node:path';
import { applyActions, readState, type Io, type Outcome } from './apply.js';
import type { InstallEnv } from './env.js';
import { planJsonAdd } from './json-config.js';
import { detectTools, planInstall, planUninstall, serverPathFor, toolsById, type Action } from './plan.js';
import { planTomlAdd } from './toml-config.js';
import { TOOLS } from './tools.js';

export const USAGE = `Usage: canada-law <command> [tools...] [--yes] [--print]

  install [tools...]    add the BC employment-law skill and MCP server to your AI tools
                        (no tools named = every supported tool found on this computer)
  uninstall [tools...]  remove what install added (no tools named = everything)
  status                show what is installed
  list                  show the supported tools

  --print   only show what would change
  --yes     apply without asking

用法：canada-law install 装进电脑上找到的所有 AI 工具；先显示要改什么，确认后才动手。`;

export type InstallerDeps = {
  env: InstallEnv;
  io: Io;
  pkgRoot: string;
  isTTY: boolean;
  ask: (question: string) => Promise<boolean>;
};

const nameOf = (id: string) => TOOLS.find((t) => t.id === id)?.name ?? id;

function describe(a: Action): string {
  switch (a.type) {
    case 'copy-file':
      return `copy the MCP server to ${a.to}`;
    case 'copy-dir':
      return `[${a.tools.map(nameOf).join(', ')}] copy the skill to ${a.to}`;
    case 'write-file':
      return `[${nameOf(a.tool)}] ${a.status === 'remove' ? 'remove canada-law from' : a.status} ${a.file}${a.backup ? ' (backup first)' : ''}`;
    case 'unchanged':
      return `[${nameOf(a.tool)}] ${a.file} is already up to date`;
    case 'command':
      return `[${nameOf(a.tool)}] run: ${basename(a.exe)} ${a.args.join(' ')}`;
    case 'manual':
      return `[${nameOf(a.tool)}] do it yourself: ${a.text}`;
    case 'write-state':
      return `record the installed tools in ${a.file}`;
    case 'remove-dir':
      return `remove ${a.path}`;
  }
}

const outcomeLine = (o: Outcome) => `  ${o.action.type === 'manual' ? '[do it yourself]' : o.ok ? '[ok]' : '[FAILED]'} ${o.message}`;

export async function runInstaller(argv: string[], deps: InstallerDeps): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const say = (s = '') => lines.push(s);
  const done = (code: number) => ({ code, out: lines.join('\n') });
  const flags = new Set(argv.filter((a) => a.startsWith('-')));
  const [cmd, ...ids] = argv.filter((a) => !a.startsWith('-'));
  const { env, io } = deps;

  if (!cmd || cmd === 'help' || flags.has('--help') || flags.has('-h')) {
    say(USAGE);
    return done(0);
  }

  if (cmd === 'list') {
    say('Supported AI tools / 支持的 AI 工具:');
    for (const t of TOOLS) say(`  ${t.id.padEnd(18)} ${t.name.padEnd(26)} ${(t.tested ? 'tested' : 'untested').padEnd(9)} ${t.detect(env) ? 'found on this computer' : '-'}`);
    return done(0);
  }

  const state = readState(env, io);

  if (cmd === 'status') {
    if (!state || state.tools.length === 0) {
      say('Nothing installed. / 还没有安装。');
      return done(0);
    }
    say('Installed for / 已安装到:');
    const server = serverPathFor(env);
    for (const t of toolsById(state.tools)) {
      const skills = t.skillDirs(env).map((d) => `${io.exists(`${d}/canada-employment-law/SKILL.md`) ? 'ok' : 'MISSING'} ${d}`);
      const m = t.mcp(env, server);
      const mcp =
        m.kind === 'json' ? (planJsonAdd(io.read(m.file), m.format, server).status === 'unchanged' ? `ok ${m.file}` : `MISSING ${m.file}`)
        : m.kind === 'toml' ? (planTomlAdd(io.read(m.file), server).status === 'unchanged' ? `ok ${m.file}` : `MISSING ${m.file}`)
        : m.kind === 'command' ? `set with ${basename(m.exe)} (check: ${basename(m.exe)} mcp list)`
        : 'manual';
      say(`  ${t.name} (${t.id})`);
      for (const s of skills) say(`    skill: ${s}`);
      say(`    MCP:   ${mcp}`);
    }
    return done(0);
  }

  if (cmd !== 'install' && cmd !== 'uninstall') {
    say(USAGE);
    return done(2);
  }

  let actions: Action[];
  try {
    if (cmd === 'install') {
      const targets = ids.length > 0 ? ids : detectTools(env).map((t) => t.id);
      if (targets.length === 0) {
        say('No supported AI tool was found on this computer. / 这台电脑上没找到支持的 AI 工具。');
        say('Run "canada-law list" to see the supported tools, or name one: canada-law install <tool>');
        return done(1);
      }
      actions = planInstall(targets, env, { pkgRoot: deps.pkgRoot, read: io.read, previous: state ?? undefined });
    } else {
      if (!state && ids.length === 0) {
        say('Nothing installed. / 还没有安装。');
        return done(0);
      }
      actions = planUninstall(ids.length > 0 ? ids : null, env, { read: io.read, state });
    }
  } catch (e) {
    say(e instanceof Error ? e.message : String(e));
    return done(2);
  }

  say(`${cmd === 'install' ? 'Install' : 'Uninstall'} plan / 计划:`);
  for (const a of actions) say(`  ${describe(a)}`);
  say();

  if (flags.has('--print')) {
    say('Preview only: nothing was changed. / 只是预览，没有改动任何东西。');
    return done(0);
  }
  if (!flags.has('--yes')) {
    if (!deps.isTTY) {
      say('Nothing was changed yet. Re-run with --yes to apply. / 还没有改动。加上 --yes 再运行一次才会执行。');
      return done(0);
    }
    if (!(await deps.ask('Apply these changes? / 确认执行？ [y/N] '))) {
      say('Cancelled: nothing was changed. / 已取消，没有改动。');
      return done(0);
    }
  }

  const outcomes = applyActions(actions, io);
  say('Result / 结果:');
  for (const o of outcomes) say(outcomeLine(o));
  say();
  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length > 0) say(`${failed.length} step(s) failed; see above. / 有 ${failed.length} 步失败，见上。`);
  if (cmd === 'install') {
    say('Restart your AI tools so they pick up the change. / 重启你的 AI 工具后生效。');
    if (actions.some((a) => a.type === 'write-file' && a.tool === 'claude-desktop')) {
      say('Claude Desktop: quit it completely, then reopen. / Claude 桌面版：完全退出后再打开。');
    }
  }
  return done(failed.length > 0 ? 1 : 0);
}
