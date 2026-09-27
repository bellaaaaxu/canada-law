// Justice Laws facts that are not in an act's XML: the official page's title, citation and "current to" line,
// and the official list of acts and regulations (Legis.xml). What the website does is recorded in SPEC.md ("联邦").
import { ToolError } from '../tool-error.js';
import { decodeEntities } from './xml.js';

export const FED_BASE = 'https://laws-lois.justice.gc.ca';

// ---------- official page ----------

export type FedPageMeta = { title: string | null; citation: string | null; currentTo: string | null; lastAmended: string | null };

// Inline tags (<abbr>, <a>) sit inside words and citations, so they are dropped without a space.
const text = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/**
 * "Canada Labour Code (R.S.C., 1985, c. L-2)" in the h1, and "Act current to 2026-09-03 and last amended on
 * 2025-12-12." (acts) or "Regulations are current to …" (regulations). The XML's own dates are when the file was
 * built, not the current-to date (tested 2026-09-26), so this line is the only source for it.
 */
export function parseFedPage(html: string): FedPageMeta {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const head = h1 ? text(h1[1]).match(/^(.*?)\s*\(((?:[^()]|\([^()]*\))*)\)$/) : null;
  const line = text(html).match(/(?:Act|Regulations are) current to (\d{4}-\d{2}-\d{2})(?: and last amended on (\d{4}-\d{2}-\d{2}))?/);
  return {
    title: head ? head[1] : h1 ? text(h1[1]) || null : null,
    citation: head ? head[2] : null,
    currentTo: line ? line[1] : null,
    lastAmended: line?.[2] ?? null,
  };
}

// ---------- official list ----------

export type LegisEntry = {
  /** The id the website uses in its addresses (from the XML link), e.g. "L-2", "C.R.C.,_c._986", "SOR-86-304". */
  id: string;
  /** The list's own id, e.g. "C.R.C., c. 986". */
  uniqueId: string;
  kind: 'act' | 'regulation';
  title: string;
  /** Acts only: "L-2" for a Revised Statutes chapter, "1996, c. 23" for a Statutes of Canada chapter. */
  officialNumber: string | null;
  /** Regulations only: the id acts use in RegsMadeUnderAct, e.g. "602863e". */
  ref: string | null;
  /** Acts only: the regulations made under the act. */
  regRefs: string[];
};

const field = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? decodeEntities(m[1]).trim() : null;
};
const idFromLink = (link: string | null) => (link ? decodeURIComponent(link.replace(/^.*\/XML\//, '').replace(/\.xml$/i, '')) : null);

/** English entries of Legis.xml (it lists repealed acts too, without saying so). */
export function parseLegis(xml: string): LegisEntry[] {
  const out: LegisEntry[] = [];
  for (const m of xml.matchAll(/<Act>([\s\S]*?)<\/Act>/g)) {
    const b = m[1];
    const id = idFromLink(field(b, 'LinkToXML'));
    if (field(b, 'Language') !== 'eng' || !id) continue;
    out.push({
      id,
      uniqueId: field(b, 'UniqueId') ?? id,
      kind: 'act',
      title: field(b, 'Title') ?? id,
      officialNumber: field(b, 'OfficialNumber'),
      ref: null,
      regRefs: [...b.matchAll(/<Reg idRef="([^"]*)"/g)].map((r) => r[1]),
    });
  }
  for (const m of xml.matchAll(/<Regulation id="([^"]*)"[^>]*>([\s\S]*?)<\/Regulation>/g)) {
    const b = m[2];
    const id = idFromLink(field(b, 'LinkToXML'));
    if (field(b, 'Language') !== 'eng' || !id) continue;
    out.push({ id, uniqueId: field(b, 'UniqueId') ?? id, kind: 'regulation', title: field(b, 'Title') ?? id, officialNumber: null, ref: m[1], regRefs: [] });
  }
  return out;
}

// The list's numbers are not the citations the official pages print: worked out by rule, 3 of 40 came out wrong
// (2026-09-26: "R.S.C., 1985, c. 17 (3rd Supp.)", "R.S.C. 1970, c. W-4", SOR-2024-1597 cited as "2024, c. 15, s. 97").
// So citations are always read from the official page.

// ---------- ids ----------

/** "C.R.C., c. 986" → "C.R.C.,_c._986"; "SOR/86-304" → "SOR-86-304"; anything that is not a plain id → ToolError. */
export function normalizeFedId(input: string): string {
  const t = input.trim();
  const crc = t.match(/^C\.R\.C\.,?[\s_]*c\.[\s_]*(\d+)$/i);
  const id = crc ? `C.R.C.,_c._${crc[1]}` : t.replace(/^(SOR|SI)\/(\d+-\d+)$/i, '$1-$2');
  if (!/^[A-Za-z0-9][A-Za-z0-9.,_-]*$/.test(id) || id.includes('..')) {
    throw new ToolError(`act_id "${input}" is not a Justice Laws id (such as L-2 or C.R.C.,_c._986). Look it up with find_act (tool) or find (command).`);
  }
  return id;
}

/** BC ids are letters, digits and underscores ("96113_01"); federal ones have a hyphen, a slash or the C.R.C. form. */
export const isFederalId = (id: string) => /[-/]/.test(id) || /^C\.R\.C\./i.test(id.trim());
