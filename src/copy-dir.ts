import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recursive folder copy. Deliberately not fs.cpSync: on Node 24 for Windows it kills the process — no error,
 * no output, exit code 127 — when the path contains Chinese characters (found 2026-09-25). Many Chinese-speaking
 * users have Chinese Windows user names, so every path under their home folder would hit it.
 */
export function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}
