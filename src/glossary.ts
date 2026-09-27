// Everyday words (Chinese, or everyday English such as "stat holiday") ↔ statutory English, per jurisdiction
// (data/glossary.json). Every entry is checked against the source text before it is added
// (npm run verify-glossary). Lookups never guess: no match → [].
import { readFileSync } from 'node:fs';
import type { Jurisdiction } from './types.js';

export type GlossaryEntry = {
  jurisdiction: Jurisdiction;
  en_terms: string[];
  acts: { act_id: string; where: string }[];
};
export type Glossary = Record<string, GlossaryEntry[]>;

export type TermMatch = GlossaryEntry & { term: string; match: 'exact' | 'english' | 'contained' };

export const GLOSSARY_FILE = new URL('../data/glossary.json', import.meta.url);

export function loadGlossary(file: URL | string = GLOSSARY_FILE): Glossary {
  const g = JSON.parse(readFileSync(file, 'utf8')) as Glossary;
  for (const [key, entries] of Object.entries(g)) {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error(`glossary: "${key}" has no entries`);
    for (const e of entries) {
      if (!['bc', 'federal'].includes(e.jurisdiction) || !Array.isArray(e.en_terms) || e.en_terms.length === 0 || !Array.isArray(e.acts)) {
        throw new Error(`glossary: malformed entry under "${key}"`);
      }
    }
  }
  return g;
}

/** "s.1 definition; s.16.1; Part 4" → sections ["1", "16.1"], parts ["4"] (used to check entries against the source text). */
export function parseWhere(where: string): { sections: string[]; parts: string[] } {
  return {
    sections: [...where.matchAll(/\bs\.\s*(\d+(?:\.\d+)*)/g)].map((m) => m[1]),
    parts: [...where.matchAll(/\bPart\s+(\d+(?:\.\d+)*)/g)].map((m) => m[1]),
  };
}

const isAscii = (s: string) => /^[\x00-\x7f]*$/.test(s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a term starts in a text, or -1. Chinese: plain substring. English: any case, only at the start of a word. */
function position(text: string, term: string): number {
  if (!isAscii(term)) return text.indexOf(term);
  const m = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(term)}`, 'i').exec(text);
  return m ? m.index + m[1].length : -1;
}

/** Glossary terms that occur in a text, in order of appearance, dropping a term that only occurs inside a longer matched one. */
export function termsInText(g: Glossary, text: string): string[] {
  const found = Object.keys(g)
    .map((k) => ({ k, at: position(text, k) }))
    .filter((f) => f.at >= 0);
  return found
    .filter((f) => !found.some((o) => o.k.length > f.k.length && o.k.toLowerCase().includes(f.k.toLowerCase())))
    .sort((a, b) => a.at - b.at)
    .map((f) => f.k);
}

export function lookupTerm(g: Glossary, term: string): TermMatch[] {
  const t = term.trim();
  const expand = (key: string, match: TermMatch['match']) => g[key].map((e) => ({ term: key, match, ...e }));

  const key = Object.keys(g).find((k) => k.toLowerCase() === t.toLowerCase());
  if (key) return expand(key, 'exact');

  const lower = t.toLowerCase();
  const english = Object.keys(g).filter((k) => g[k].some((e) => e.en_terms.some((en) => en.toLowerCase() === lower)));
  if (english.length > 0) return english.flatMap((k) => expand(k, 'english'));

  return termsInText(g, t).flatMap((k) => expand(k, 'contained'));
}
