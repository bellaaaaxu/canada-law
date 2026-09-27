// npm run bundle: the release artifacts. Every script starts with "#!/usr/bin/env node" — without it, npm's
// Windows shim opens the file instead of running it, and the command "succeeds" doing nothing (D1c, 2026-09-24).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = (...p: string[]) => join(root, ...p);
const pkg = JSON.parse(readFileSync(at('package.json'), 'utf8')) as { version: string };
const glossary = readFileSync(at('data', 'glossary.json'), 'utf8');

const bundle = (entry: string, outfile: string, define: Record<string, string> = {}) =>
  build({
    entryPoints: [at(entry)],
    outfile: at(outfile),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
    define,
    logLevel: 'warning',
  });

// 1. The skill: script + glossary next to it
const skill = at('skills', 'canada-employment-law');
await bundle('src/cli-entry.ts', 'skills/canada-employment-law/scripts/bclaw.mjs');
mkdirSync(join(skill, 'assets'), { recursive: true });
copyFileSync(at('data', 'glossary.json'), join(skill, 'assets', 'glossary.json'));

// 2. The single-file MCP server, glossary embedded
await bundle('src/mcp-standalone.ts', 'mcp/canada-law-mcp.mjs', { __GLOSSARY__: glossary });

// 3. The installer (bin of the npm package)
await bundle('src/install/bin.ts', 'bin/canada-law.mjs');

// 4. The Claude Desktop extension (.mcpb): manifest with this version + the MCP server
const staging = at('release', 'mcpb-staging');
rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, 'server'), { recursive: true });
const manifest = JSON.parse(readFileSync(at('mcpb', 'manifest.json'), 'utf8'));
manifest.version = pkg.version;
writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
copyFileSync(at('mcp', 'canada-law-mcp.mjs'), join(staging, 'server', 'index.mjs'));
const mcpbCli = at('node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');
const out = at('release', `canada-law-${pkg.version}.mcpb`);
mkdirSync(dirname(out), { recursive: true });
execFileSync(process.execPath, [mcpbCli, 'validate', join(staging, 'manifest.json')], { stdio: 'inherit' });
execFileSync(process.execPath, [mcpbCli, 'pack', staging, out], { stdio: 'inherit' });

console.log(`\nbuilt: skills/canada-employment-law/, mcp/canada-law-mcp.mjs${existsSync(at('bin', 'canada-law.mjs')) ? ', bin/canada-law.mjs' : ''}, release/canada-law-${pkg.version}.mcpb`);
