// Entry point of the installer (bundled as bin/canada-law.mjs; run with npx).
import { dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { realIo } from './apply.js';
import { realEnv } from './env.js';
import { runInstaller } from './main.js';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url))); // bin/canada-law.mjs → package root

async function ask(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

const r = await runInstaller(process.argv.slice(2), { env: realEnv(), io: realIo(), pkgRoot, isTTY: Boolean(process.stdin.isTTY), ask });
process.stdout.write(r.out + '\n');
process.exitCode = r.code;
