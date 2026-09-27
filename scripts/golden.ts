// Golden test (npm run golden): runs every question through both things users actually get —
// the skill's script (skills/…/scripts/bclaw.mjs) and the single-file MCP server (mcp/canada-law-mcp.mjs, over stdio).
// "Hit" (SPEC, 2026-09-24): glossary word in the question → statutory English → search → the expected
// section is among the top 5 results. No AI model in the loop.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadGlossary, termsInText } from '../src/glossary.js';

const TOP_N = 5;
type Case = { q: string; expect: { jurisdiction: string; act_id: string; section: string | null } };
type Hit = { act_id: string; act_title: string; section: string; heading: string | null; match: string[] };
type Path = { name: string; term: (t: string) => Promise<{ jurisdiction: string; en_terms: string[] }[]>; search: (phrases: string[]) => Promise<Hit[]> };

const root = new URL('../', import.meta.url);
const cases: Case[] = readFileSync(new URL('tests/golden.jsonl', root), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
const glossary = loadGlossary();

// Path 1: the skill script
const script = fileURLToPath(new URL('skills/canada-employment-law/scripts/bclaw.mjs', root));
const cli = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' }));
const skillPath: Path = {
  name: 'skill',
  term: async (t) => cli('term', t),
  search: async (phrases) => cli('search', ...phrases).results,
};

// Path 2: the single-file MCP server
const client = new Client({ name: 'golden', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('mcp/canada-law-mcp.mjs', root))], stderr: 'inherit' }));
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { text: string }[])[0].text;
  if (r.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text);
};
const mcpPath: Path = {
  name: 'mcp',
  term: (t) => call('map_term', { term: t }),
  search: async (phrases) => (await call('search_law', { query: phrases.map((p) => `"${p}"`).join(' OR '), jurisdiction: 'bc', limit: 10 })).results,
};

let ran = 0;
let failed = 0;
for (const { q, expect } of cases) {
  if (expect.jurisdiction !== 'bc') {
    console.log(`SKIP  ${q}  (${expect.jurisdiction} — milestone M2)`);
    continue;
  }
  for (const path of [skillPath, mcpPath]) {
    ran++;
    try {
      const words = termsInText(glossary, q);
      if (words.length === 0) throw new Error('no glossary word found in the question');
      const phrases = new Set<string>();
      for (const w of words) for (const m of await path.term(w)) if (m.jurisdiction === expect.jurisdiction) m.en_terms.forEach((t) => phrases.add(t));
      const results = await path.search([...phrases]);
      const rank = results.findIndex((x) => x.act_id === expect.act_id && x.section === expect.section) + 1;
      const pass = rank >= 1 && rank <= TOP_N;
      if (!pass) failed++;
      console.log(`${pass ? 'PASS' : 'FAIL'}  [${path.name}] ${q}`);
      console.log(`        ${words.join(', ')} → ${[...phrases].join(' | ')} → ${expect.act_id} s.${expect.section}: ${rank ? `rank ${rank}` : 'not in results'}`);
      if (!pass) results.slice(0, TOP_N).forEach((x, i) => console.log(`          ${i + 1}. ${x.act_title} s.${x.section} ${x.heading ?? ''}`));
    } catch (e) {
      failed++;
      console.log(`FAIL  [${path.name}] ${q}\n        ${(e as Error).message}`);
    }
  }
}
await client.close();
console.log(`\n${ran - failed}/${ran} BC golden checks hit within the top ${TOP_N} (each question through the skill script and the MCP server).`);
process.exit(failed > 0 ? 1 : 0);
