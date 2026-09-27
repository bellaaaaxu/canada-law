// The published documents must not drift from the code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { USER_AGENT } from '../src/http.js';
import { TOOLS } from '../src/install/tools.js';
import { BC_LAWS_NOTICE } from '../src/notice.js';
import { INSTRUCTIONS } from '../src/server.js';
import { VERSION } from '../src/version.js';

const doc = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const ZH_NAMES: Record<string, string> = { 'Claude Desktop': 'Claude 桌面版', 'Google Antigravity': '谷歌 Antigravity', 'Qwen Code': '通义 Qwen Code' };

describe('published documents', () => {
  it('uses one version number: package.json, the MCP server and the User-Agent', () => {
    expect(VERSION).toBe(JSON.parse(doc('package.json')).version);
    expect(USER_AGENT).toContain(`/${VERSION} `);
  });

  it.each(['README.md', 'README.zh.md', 'NOTICE', 'tests/fixtures/NOTICE'])('%s carries the licence statement word for word', (name) => {
    expect(doc(name)).toContain(BC_LAWS_NOTICE);
  });

  it('README.md lists every supported tool', () => {
    for (const t of TOOLS) expect(doc('README.md'), t.name).toContain(t.name);
  });

  it('README.zh.md lists every supported tool', () => {
    for (const t of TOOLS) expect(doc('README.zh.md'), t.name).toContain(ZH_NAMES[t.name] ?? t.name);
  });

  // SPEC-开源分发.md: the rules for the AI are written into SKILL.md and are the same in the MCP instructions
  // (a Claude Desktop user with the .mcpb only gets the instructions).
  it.each([
    'Never answer a BC employment-law question from memory',
    'What the law says',
    'What it means',
    'What decides the outcome',
    'Not from the official text',
    'Where to get help',
    'Sources',
    "Do not decide the user's own case",
    'In parts 1 to 3, state only what the retrieved text says',
    'not checked against the official text',
    'snippets are cut short',
    'whether a layoff counts as just cause',
    'do not conclude that the law has no such rule',
    'https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us',
    'not an official version',
    'not legal advice',
    'federally regulated',
  ])('SKILL.md and the MCP instructions both say: %s', (rule) => {
    expect(doc('skills/canada-employment-law/SKILL.md')).toContain(rule);
    expect(INSTRUCTIONS).toContain(rule);
  });

  it.each(['README.md', 'README.zh.md'])('%s marks exactly the tools tested on a real installation', (name) => {
    const tableRows = doc(name).split('\n').filter((l) => l.startsWith('| ') && l.trim().endsWith('|'));
    const tested = tableRows.filter((l) => l.trim().endsWith('| ✅ |'));
    expect(tested.length).toBe(TOOLS.filter((t) => t.tested).length);
    for (const t of TOOLS.filter((x) => x.tested)) expect(tested.some((l) => l.includes(ZH_NAMES[t.name] ?? t.name))).toBe(true);
  });
});
