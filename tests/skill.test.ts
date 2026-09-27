// Format rules for the published skill, from the Agent Skills spec and what D1 / D1b found.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('../skills/canada-employment-law/', import.meta.url);
const text = readFileSync(new URL('SKILL.md', dir), 'utf8');
const [, front, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
const field = (name: string) => front?.match(new RegExp(`^${name}: (.*)$`, 'm'))?.[1] ?? '';

describe('SKILL.md', () => {
  it('has frontmatter and a body', () => {
    expect(front).toBeTruthy();
    expect(body).toBeTruthy();
  });

  it('uses a valid name that matches its folder', () => {
    expect(field('name')).toBe('canada-employment-law');
    expect(field('name')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('keeps the description within 200 characters (claude.ai limit) and says never to answer from memory', () => {
    const d = field('description');
    expect(d.length).toBeGreaterThan(0);
    expect(d.length).toBeLessThanOrEqual(200);
    expect(d).toMatch(/never answer from memory/i);
  });

  it('declares license and the Node.js / network requirement', () => {
    expect(field('license')).toBe('MIT');
    expect(field('compatibility')).toMatch(/Node\.js 20\+/);
    expect(field('compatibility').length).toBeLessThanOrEqual(500);
  });

  it('is ASCII-only (Python-based loaders on Chinese Windows read files as GBK)', () => {
    expect([...text].filter((c) => c.charCodeAt(0) > 0x7f)).toEqual([]);
  });

  it('links the script with a Markdown link (VS Code requires it)', () => {
    expect(body).toMatch(/\]\(scripts\/bclaw\.mjs\)/);
  });

  it('prescribes the answer format, with a separate part for anything not from the official text', () => {
    for (const part of ['What the law says', 'What it means', 'What decides the outcome', 'Not from the official text', 'Where to get help', 'Sources']) {
      expect(body, part).toContain(part);
    }
  });

  it('carries every rule from the spec', () => {
    expect(body).toMatch(/Never answer .* from memory/);
    expect(body).toMatch(/not legal advice/);
    expect(body).toMatch(/Do not decide the user's own case/);
    expect(body).toMatch(/do not conclude that the law has no such rule/);
    // D3 (2026-09-26, option A): "leave it out" was ignored twice, so anything unchecked goes in its own labelled part
    expect(body).toMatch(/In parts 1 to 3, state only what the retrieved text says/);
    expect(body).toMatch(/not checked against the official text/);
    expect(body).toMatch(/snippets are cut short/); // D3 run 3: s.44 explained from a snippet that stopped mid-sentence
    expect(body).toMatch(/federally regulated/);
    expect(body).toContain('https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/contact-us');
    expect(body).toMatch(/not an official version/);
  });

  it('stays short enough to load in full (under 500 lines)', () => {
    expect(text.split('\n').length).toBeLessThan(500);
  });
});
