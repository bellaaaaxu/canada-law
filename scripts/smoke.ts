// npm run smoke (after npm run bundle): copy the built artifacts into an empty temp folder and run them there,
// as a user would. Needs internet (reads BC Laws and the Justice Laws Website).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { copyDir } from '../src/copy-dir.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = (await import('../package.json', { with: { type: 'json' } })).default.version as string;
const work = mkdtempSync(join(tmpdir(), 'canada-law-smoke-'));
let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};
const nonAscii = (s: string) => [...s].filter((c) => c.charCodeAt(0) > 0x7f).length;

try {
  // 1. the skill folder on its own
  copyDir(join(root, 'skills', 'canada-employment-law'), join(work, 'canada-employment-law'));
  const script = join(work, 'canada-employment-law', 'scripts', 'bclaw.mjs');
  const run = (...args: string[]) => execFileSync(process.execPath, [script, ...args], { cwd: work, encoding: 'utf8' });
  const term = run('term', '法定假日');
  check('skill: term 法定假日 is ASCII-only JSON', nonAscii(term) === 0 && JSON.parse(term)[0]?.term === '法定假日');
  const sec = JSON.parse(run('section', '96113_01', '40'));
  check('skill: section 96113_01 40', sec.citation?.heading?.startsWith('Overtime wages') && !!sec.citation.current_to && !!sec.notice, `current_to=${sec.citation?.current_to}`);
  const fed = JSON.parse(run('section', 'L-2', '166'));
  check(
    'skill: section L-2 166 (federal)',
    fed.citation?.jurisdiction === 'federal' && fed.citation.heading === 'Definitions' && !!fed.citation.current_to && /Justice Laws Website/.test(fed.notice ?? ''),
    `current_to=${fed.citation?.current_to}`,
  );
  const fedSearch = JSON.parse(run('search', 'federal', 'general holiday', 'general holidays'));
  check('skill: search federal "general holiday"', fedSearch.results?.[0]?.section === '166', `first: ${fedSearch.results?.[0]?.act_id} s.${fedSearch.results?.[0]?.section}`);
  // Canary: every federal golden answer is in the Code itself, so a list that stopped naming its regulations would
  // pass golden unnoticed. 33 documents on 2026-09-26 (the Code and 32 regulations).
  check('skill: federal search read the Code and its regulations', fedSearch.documents_searched >= 30 && fedSearch.warnings?.length === 0, `${fedSearch.documents_searched} documents; warnings: ${fedSearch.warnings?.length}`);

  // 2. the single-file MCP server on its own
  copyFileSync(join(root, 'mcp', 'canada-law-mcp.mjs'), join(work, 'canada-law-mcp.mjs'));
  const client = new Client({ name: 'smoke', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(work, 'canada-law-mcp.mjs')], cwd: work }));
  const { tools } = await client.listTools();
  check('mcp: five tools', tools.length === 5, tools.map((t) => t.name).sort().join(','));
  const text = async (name: string, args: Record<string, unknown>) =>
    ((await client.callTool({ name, arguments: args })).content as { text: string }[])[0].text;
  const meal = JSON.parse(await text('map_term', { term: 'lunch break' }));
  check('mcp: map_term("lunch break") uses the embedded glossary', meal[0]?.en_terms?.includes('meal break'));
  const s32 = JSON.parse(await text('get_section', { jurisdiction: 'bc', act_id: '96113_01', section: '32' }));
  check('mcp: get_section 96113_01 32', s32.citation?.heading === 'Meal breaks' && !!s32.notice);
  const break_ = JSON.parse(await text('get_section', { jurisdiction: 'federal', act_id: 'L-2', section: '169.1' }));
  check('mcp: get_section federal L-2 169.1', break_.citation?.heading === 'Break' && !!break_.citation.current_to, `current_to=${break_.citation?.current_to}`);
  await client.close();

  // 3. the Claude Desktop extension
  const mcpb = join(root, 'release', `canada-law-${version}.mcpb`);
  check('mcpb: built', existsSync(mcpb) && statSync(mcpb).size > 100_000, existsSync(mcpb) ? `${Math.round(statSync(mcpb).size / 1024)} KB` : 'missing');
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} smoke check(s) failed.` : '\nAll smoke checks passed.');
process.exit(failed ? 1 : 0);
