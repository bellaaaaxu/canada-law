// What the installer can see of the user's machine. Tests pass a fake home folder instead of the real one.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export type InstallEnv = {
  home: string;
  appData: string | null; // %APPDATA% on Windows
  localAppData: string | null; // %LOCALAPPDATA% on Windows
  platform: string; // process.platform: 'win32' | 'darwin' | 'linux' …
  which: (cmd: string) => string | null; // full path of a command on PATH, or null
};

export function findOnPath(cmd: string, pathVar = process.env.PATH ?? '', platform = process.platform): string | null {
  const exts = platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, cmd + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export function realEnv(): InstallEnv {
  return {
    home: homedir(),
    appData: process.env.APPDATA ?? null,
    localAppData: process.env.LOCALAPPDATA ?? null,
    platform: process.platform,
    which: (c) => findOnPath(c),
  };
}
