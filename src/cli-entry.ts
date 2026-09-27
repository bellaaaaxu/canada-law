// Entry point of the bundled skill script. The glossary sits next to it in the skill folder: ../assets/glossary.json.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './cli.js';
import { loadGlossary } from './glossary.js';
import { createCachedFetcher } from './http.js';
import { BcClient } from './sources/bc.js';

const glossary = loadGlossary(fileURLToPath(new URL('../assets/glossary.json', import.meta.url)));
const bc = new BcClient({ fetcher: createCachedFetcher({ cacheDir: join(tmpdir(), 'canada-law-cache') }) });
const r = await runCli(process.argv.slice(2), { bc, glossary });
if (r.stdout) process.stdout.write(r.stdout + '\n');
if (r.stderr) process.stderr.write(r.stderr + '\n');
process.exitCode = r.code;
