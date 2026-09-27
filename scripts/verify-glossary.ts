// Live check of data/glossary.json against the official BC text (npm run verify-glossary).
// An entry passes only if every cited section / Part exists, every cited section contains one of its
// English terms, and every English term occurs in a cited section or Part title (so each term is real statutory wording).
import { fileURLToPath } from 'node:url';
import { loadGlossary, parseWhere } from '../src/glossary.js';
import { createCachedFetcher } from '../src/http.js';
import { BcClient } from '../src/sources/bc.js';

const cacheDir = fileURLToPath(new URL('../cache/', import.meta.url));
const bc = new BcClient({ fetcher: createCachedFetcher({ cacheDir }) });
const glossary = loadGlossary();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, term: string) => new RegExp(`\\b${escape(term)}\\b`, 'i').test(text);

let failures = 0;
let checked = 0;
for (const [zh, entries] of Object.entries(glossary)) {
  for (const e of entries) {
    if (e.jurisdiction !== 'bc') {
      console.log(`SKIP ${zh} (${e.jurisdiction}: not checkable until M2)`);
      continue;
    }
    checked++;
    const problems: string[] = [];
    const evidence: string[] = [];
    const termSeen = new Set<string>();
    for (const ref of e.acts) {
      const { sections, parts } = parseWhere(ref.where);
      if (sections.length === 0 && parts.length === 0) problems.push(`"${ref.where}" names no section or Part`);
      for (const s of sections) {
        try {
          const r = await bc.getSection(ref.act_id, s);
          const text = `${r.citation.heading ?? ''}\n${r.text}`;
          const found = e.en_terms.filter((t) => has(text, t));
          found.forEach((t) => termSeen.add(t));
          if (found.length === 0) problems.push(`s.${s} (${r.citation.heading}) contains none of the English terms`);
          else evidence.push(`s.${s} ${r.citation.heading}`);
        } catch (err) {
          problems.push(`s.${s}: ${(err as Error).message}`);
        }
      }
      if (parts.length > 0) {
        const toc = await bc.getToc(ref.act_id);
        for (const p of parts) {
          const line = toc.outline.split('\n').find((l) => l.startsWith(`Part ${p} — `));
          if (!line) {
            problems.push(`Part ${p} not found in ${ref.act_id}`);
            continue;
          }
          evidence.push(line);
          e.en_terms.filter((t) => has(line, t)).forEach((t) => termSeen.add(t)); // a Part title is statutory text too
        }
      }
    }
    for (const t of e.en_terms) if (!termSeen.has(t)) problems.push(`"${t}" does not occur in any cited section`);

    if (problems.length > 0) failures++;
    console.log(`${problems.length ? 'FAIL' : 'PASS'} ${zh} → ${e.en_terms.join(' | ')}`);
    for (const line of evidence) console.log(`       ✓ ${line}`);
    for (const p of problems) console.log(`       ✗ ${p}`);
  }
}
console.log(`\n${checked - failures}/${checked} BC entries verified against the official text.`);
process.exit(failures > 0 ? 1 : 0);
