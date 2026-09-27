// Live check of data/glossary.json against the official text (npm run verify-glossary): BC Laws and Justice Laws.
// An entry passes only if every cited section / Part / Division exists, every cited section contains one of its
// English terms, and every English term occurs in a cited section or Part / Division title (so each term is real
// statutory wording). A federal section is read together with the headings above it: federal law often names a thing
// only there (s.206 is under "Maternity Leave", s.235 under "DIVISION XI — Severance Pay").
import { fileURLToPath } from 'node:url';
import { findTitleLine, loadGlossary, parseWhere, type GlossaryEntry } from '../src/glossary.js';
import { createCachedFetcher } from '../src/http.js';
import { BcClient } from '../src/sources/bc.js';
import { FederalClient } from '../src/sources/federal.js';

const cacheDir = fileURLToPath(new URL('../cache/', import.meta.url));
const fetcher = createCachedFetcher({ cacheDir });
const bc = new BcClient({ fetcher });
const federal = new FederalClient({ fetcher });
const glossary = loadGlossary();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, term: string) => new RegExp(`\\b${escape(term)}\\b`, 'i').test(text);

async function sectionText(e: GlossaryEntry, actId: string, s: string) {
  if (e.jurisdiction === 'federal') {
    const r = await federal.getSection(actId, s);
    return { label: `s.${s} ${r.citation.heading ?? ''}`.trim(), text: `${r.citation.heading ?? ''}\n${r.location.join('\n')}\n${r.text}` };
  }
  const r = await bc.getSection(actId, s);
  return { label: `s.${s} ${r.citation.heading}`, text: `${r.citation.heading ?? ''}\n${r.text}` };
}

let failures = 0;
let checked = 0;
const byJurisdiction = { bc: 0, federal: 0 };
for (const [key, entries] of Object.entries(glossary)) {
  for (const e of entries) {
    checked++;
    byJurisdiction[e.jurisdiction]++;
    const problems: string[] = [];
    const evidence: string[] = [];
    const termSeen = new Set<string>();
    for (const ref of e.acts) {
      const { sections, parts, divisions } = parseWhere(ref.where);
      if (sections.length + parts.length + divisions.length === 0) problems.push(`"${ref.where}" names no section, Part or Division`);
      for (const s of sections) {
        try {
          const { label, text } = await sectionText(e, ref.act_id, s);
          const found = e.en_terms.filter((t) => has(text, t));
          found.forEach((t) => termSeen.add(t));
          if (found.length === 0) problems.push(`${ref.act_id} ${label} contains none of the English terms`);
          else evidence.push(`${ref.act_id} ${label}`);
        } catch (err) {
          problems.push(`${ref.act_id} s.${s}: ${(err as Error).message}`);
        }
      }
      if (parts.length + divisions.length > 0) {
        const toc = e.jurisdiction === 'federal' ? await federal.getToc(ref.act_id) : await bc.getToc(ref.act_id);
        for (const [kind, nums] of [['Part', parts], ['Division', divisions]] as const) {
          for (const n of nums) {
            // "Part III; Division IV": the Division is looked for in that Part
            const found = findTitleLine(toc.outline, kind, n, kind === 'Division' && parts.length === 1 ? parts[0] : undefined);
            if ('error' in found) {
              problems.push(`${ref.act_id}: ${found.error}`);
              continue;
            }
            const line = found.line;
            evidence.push(`${ref.act_id} ${line}`);
            e.en_terms.filter((t) => has(line, t)).forEach((t) => termSeen.add(t)); // a Part or Division title is statutory text too
          }
        }
      }
    }
    for (const t of e.en_terms) if (!termSeen.has(t)) problems.push(`"${t}" does not occur in any cited section`);

    if (problems.length > 0) failures++;
    console.log(`${problems.length ? 'FAIL' : 'PASS'} [${e.jurisdiction}] ${key} → ${e.en_terms.join(' | ')}`);
    for (const line of evidence) console.log(`       ✓ ${line}`);
    for (const p of problems) console.log(`       ✗ ${p}`);
  }
}
console.log(`\n${checked - failures}/${checked} entries verified against the official text (BC ${byJurisdiction.bc}, federal ${byJurisdiction.federal}).`);
process.exit(failures > 0 ? 1 : 0);
