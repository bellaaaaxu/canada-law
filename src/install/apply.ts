// Carry out an action list on the real machine: copy files, write configs (backing up first), run commands.
// Every action reports what happened; nothing fails silently.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { copyDir } from '../copy-dir.js';
import type { InstallEnv } from './env.js';
import { SKILL_NAME, statePathFor, type Action, type InstallState } from './plan.js';

export type Io = {
  read: (file: string) => string | null;
  write: (file: string, text: string) => void;
  exists: (path: string) => boolean;
  copyFile: (from: string, to: string) => void;
  copyDir: (from: string, to: string) => void;
  removeDir: (path: string) => void;
  run: (exe: string, args: string[]) => { code: number; out: string };
  now: () => Date;
};

/** cmd.exe needs .cmd/.bat shims run through the shell; quote anything that is not plainly safe. */
export const quoteForCmd = (s: string) => (/^[A-Za-z0-9_\-.:\\/=@]+$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);

export function realIo(): Io {
  return {
    read: (file) => {
      try {
        return readFileSync(file, 'utf8');
      } catch {
        return null;
      }
    },
    write: (file, text) => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    exists: existsSync,
    copyFile: (from, to) => {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    },
    copyDir, // not fs.cpSync: it crashes on Chinese paths (see copy-dir.ts)
    removeDir: (path) => rmSync(path, { recursive: true, force: true }),
    run: (exe, args) => {
      const viaShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe);
      const r = viaShell
        ? spawnSync([exe, ...args].map(quoteForCmd).join(' '), { shell: true, encoding: 'utf8' })
        : spawnSync(exe, args, { encoding: 'utf8' });
      return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`.trim() };
    },
    now: () => new Date(),
  };
}

export function readState(env: InstallEnv, io: Io): InstallState | null {
  const text = io.read(statePathFor(env));
  if (!text) return null;
  try {
    const s = JSON.parse(text) as InstallState;
    return Array.isArray(s.tools) ? s : null;
  } catch {
    return null;
  }
}

const isOurSkill = (dir: string, io: Io) => /^name:\s*canada-employment-law\s*$/m.test(io.read(join(dir, 'SKILL.md')) ?? '');
const isOurFolder = (path: string, io: Io) => basename(path) === '.canada-law' || (basename(path) === SKILL_NAME && isOurSkill(path, io));

export type Outcome = { action: Action; ok: boolean; message: string };

export function applyActions(actions: Action[], io: Io): Outcome[] {
  const stamp = io.now().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const backupPath = (file: string) => {
    let p = `${file}.bak-canada-law-${stamp}`;
    for (let n = 2; io.exists(p); n++) p = `${file}.bak-canada-law-${stamp}-${n}`; // never overwrite an earlier backup
    return p;
  };

  const run = (a: Action): Outcome => {
    const ok = (message: string): Outcome => ({ action: a, ok: true, message });
    const fail = (message: string): Outcome => ({ action: a, ok: false, message });
    switch (a.type) {
      case 'copy-file':
        io.copyFile(a.from, a.to);
        return ok(`copied ${a.to}`);
      case 'copy-dir':
        if (io.exists(a.to)) {
          if (!isOurSkill(a.to, io)) return fail(`${a.to} already exists and is not this skill, so it was left untouched`);
          io.removeDir(a.to); // replace an older copy completely
        }
        io.copyDir(a.from, a.to);
        return ok(`skill copied to ${a.to}`);
      case 'write-file': {
        let backup = '';
        if (a.backup && io.exists(a.file)) {
          backup = backupPath(a.file);
          io.copyFile(a.file, backup);
        }
        io.write(a.file, a.next);
        return ok(`${a.status === 'remove' ? 'removed canada-law from' : a.status === 'create' ? 'created' : 'updated'} ${a.file}${backup ? ` (backup: ${basename(backup)})` : ''}`);
      }
      case 'unchanged':
        return ok(`${a.file} already up to date`);
      case 'command': {
        const r = io.run(a.exe, a.args);
        if (r.code !== 0 && !a.ignoreFailure) return fail(`${basename(a.exe)} ${a.args.join(' ')} failed: ${r.out}`);
        return ok(`${basename(a.exe)} ${a.args.join(' ')}`);
      }
      case 'manual':
        return ok(a.text);
      case 'write-state':
        io.write(a.file, JSON.stringify(a.state, null, 2) + '\n');
        return ok(`recorded installed tools in ${a.file}`);
      case 'remove-dir':
        if (!io.exists(a.path)) return ok(`${a.path} already gone`);
        if (!isOurFolder(a.path, io)) return fail(`${a.path} is not this skill, so it was left untouched`);
        io.removeDir(a.path);
        return ok(`removed ${a.path}`);
    }
  };

  return actions.map((a) => {
    try {
      return run(a);
    } catch (e) {
      return { action: a, ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
}
