// The published documents must not drift from the code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { USER_AGENT } from '../src/http.js';
import { TOOLS } from '../src/install/tools.js';
import { BC_LAWS_NOTICE, FEDERAL_NOTICE } from '../src/notice.js';
import { INSTRUCTIONS } from '../src/server.js';
import { VERSION } from '../src/version.js';

const doc = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const ZH_NAMES: Record<string, string> = { 'Claude Desktop': 'Claude 桌面版', 'Google Antigravity': '谷歌 Antigravity', 'Qwen Code': '通义 Qwen Code' };

describe('published documents', () => {
  it('uses one version number: package.json, the MCP server and the User-Agent', () => {
    expect(VERSION).toBe(JSON.parse(doc('package.json')).version);
    expect(USER_AGENT).toContain(`/${VERSION} `);
  });

  // Claude Desktop names the MCP server after display_name: renaming it (v0.1 → v0.2) left sessions opened before the
  // upgrade calling a server that no longer exists ("Server … unavailable"). Keep it from now on.
  it('keeps the extension display name, which Claude Desktop uses as the server name', () => {
    expect(JSON.parse(doc('mcpb/manifest.json')).display_name).toBe('Canada Law (BC and federal employment law)');
  });

  it.each(['README.md', 'README.zh.md'])('%s points to the release of this version', (name) => {
    const text = doc(name);
    expect(text).toContain(`releases/download/v${VERSION}/canada-law-${VERSION}.tgz`);
    expect(text).toContain(`canada-law-${VERSION}.mcpb`);
    expect(text.match(/canada-law-\d+\.\d+\.\d+\.(?:tgz|mcpb)/g)?.every((m) => m.includes(VERSION))).toBe(true);
  });

  it.each(['README.md', 'README.zh.md', 'NOTICE', 'tests/fixtures/NOTICE'])('%s carries the licence statement word for word', (name) => {
    expect(doc(name)).toContain(BC_LAWS_NOTICE);
  });

  it.each(['README.md', 'README.zh.md', 'NOTICE', 'tests/fixtures/NOTICE'])('%s carries the federal reproduction statement word for word', (name) => {
    expect(doc(name)).toContain(FEDERAL_NOTICE);
  });

  it('README.md lists every supported tool', () => {
    for (const t of TOOLS) expect(doc('README.md'), t.name).toContain(t.name);
  });

  it('README.zh.md lists every supported tool', () => {
    for (const t of TOOLS) expect(doc('README.zh.md'), t.name).toContain(ZH_NAMES[t.name] ?? t.name);
  });

  // SPEC-开源分发.md: the rules for the AI are written into SKILL.md and are the same in the MCP instructions.
  // Claude Desktop reportedly does not pass the instructions to the model, so their answer part also comes back with the text
  // (src/answer-rules.ts; tests/server.test.ts checks it is word for word the same).
  it.each([
    'Never answer a BC or federal employment-law question from memory',
    // M2 (2026-09-26): which law applies, decided from the official text, and what federal search does not cover
    'Canada Labour Code',
    'C.R.C.,_c._986',
    '"federal work, undertaking or business"',
    'rather than relying on memory',
    'Employment Insurance (EI)',
    'Canada Pension Plan (CPP)',
    'Say which law you answered from',
    'Decide which law applies',
    'give the terms of both jurisdictions', // code review 2026-09-26: "all" with one side's terms under-searches the other
    'https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/filing-complaint.html',
    "Text from BC Laws (www.bclaws.gov.bc.ca) under the King's Printer Licence; not an official version.",
    'Text from the Justice Laws Website (laws-lois.justice.gc.ca); not an official version.',
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
    // 2026-09-27: the tools give the current text only, but people ask about things that already happened
    'say that this is the current text and that the law at that time may have been different',
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
