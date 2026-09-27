// Facts that are not in the legislative XML: the official page's current-to line and citation,
// and what kind of document each full-site search result is.
import { inlineText, parseXml, type XNode } from './bc-xml.js';
import { decodeEntities } from './xml.js';

// ---------- official HTML page ----------

export type PageMeta = { title: string | null; citation: string | null; currentTo: string | null };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "September 15, 2026" → "2026-09-15"; anything else → null. */
export function isoDate(text: string): string | null {
  const m = text.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]) + 1;
  if (month === 0) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

const plain = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * The page shows "This Act is current to …" (acts) or "This consolidation is current to …" (regulations).
 * Regulations follow a different rule than acts, so this line is the only safe source.
 */
export function parsePageMeta(html: string): PageMeta {
  const titleBlock = html.match(/<div id="title">([\s\S]*?)<\/div>/);
  const h2 = titleBlock?.[1].match(/<h2>([\s\S]*?)<\/h2>/);
  const h3 = titleBlock?.[1].match(/<h3>([\s\S]*?)<\/h3>/);
  const chapter = h3 ? plain(h3[1]).match(/^\[(R?SBC) (\d{4})\] CHAPTER ([\w.]+)$/) : null;
  const current = plain(html.slice(0, 20000)).match(/This [A-Za-z ]{2,40}? is current to ([A-Z][a-z]+ \d{1,2}, \d{4})/);
  return {
    title: h2 ? plain(h2[1]) : null,
    citation: chapter ? `${chapter[1]} ${chapter[2]}, c. ${chapter[3]}` : null,
    currentTo: current ? isoDate(current[1]) : null,
  };
}

// ---------- full-site search results ----------

export type SearchDoc = { id: string; title: string; loc: string; multiParent: string | null; frags: string[] };

const isEl = (c: unknown): c is XNode => typeof c === 'object' && c !== null;
const childText = (n: XNode, name: string) => {
  const c = n.children.find((x): x is XNode => isEl(x) && x.name === name);
  return c ? inlineText(c) : null;
};

export function parseFullSearch(xml: string): { totalHits: number; docs: SearchDoc[] } {
  const root = parseXml(xml).children.find(isEl);
  if (!root || root.name !== 'results') throw new Error('Unexpected search response (no <results> element)');
  const docs = root.children.filter((c): c is XNode => isEl(c) && c.name === 'doc');
  return {
    totalHits: Number(root.attrs.totalhits ?? docs.length),
    docs: docs.map((d) => ({
      id: childText(d, 'CIVIX_DOCUMENT_ID') ?? '',
      title: childText(d, 'CIVIX_DOCUMENT_TITLE') ?? '',
      loc: childText(d, 'CIVIX_DOCUMENT_LOC') ?? '',
      multiParent: childText(d, 'CIVIX_MULTI_PARENT'),
      frags: d.children.filter((c): c is XNode => isEl(c) && c.name === 'frag').map((f) => inlineText(f)),
    })),
  };
}

export type DocClass =
  | { kind: 'act' | 'regulation'; actId: string; docId: string; actTitle: string; actCitation: string }
  | { kind: 'other'; reason: string };

/** "60_Motor Vehicle Act [RSBC 1996] c. 318" → title + "RSBC 1996, c. 318". */
export function parseActFolder(folder: string): { title: string; citation: string | null } {
  const name = folder.replace(/^\d+_/, '').trim();
  const m = name.match(/^(.*?) \[(R?SBC) (\d{4})\] c\. ?([\w.]+)$/);
  return m ? { title: m[1], citation: `${m[2]} ${m[3]}, c. ${m[4]}` } : { title: name, citation: null };
}

/** Multi-document act: part "02057_05" → whole act "02057_00_multi" (table of contents id + "_multi"). */
export const multiActIdFor = (partId: string) => partId.replace(/_[^_]+$/, '_00') + '_multi';

/**
 * CIVIX_DOCUMENT_LOC tells what a search hit is:
 *   "-- E --/Employment Standards Act [RSBC 1996] c. 113/00_96113_01.xml"   → the act (single document)
 *   ".../Business Corporations Act [SBC 2002] c. 57/00_Act/07_02057_05.xml" → one part of a multi-document act
 *   ".../05_Regulations/11_396_95.xml"                                       → a regulation
 *   TLC, Historical Table, Point in Time folders                             → not current law text
 */
export function classifyDoc(d: SearchDoc): DocClass {
  const [, folder, ...rest] = d.loc.split('/');
  if (!folder || rest.length === 0) return { kind: 'other', reason: 'unrecognised location' };
  const act = parseActFolder(folder);

  if (rest.length === 1 && /^00_/.test(rest[0])) {
    return { kind: 'act', actId: d.id, docId: d.id, actTitle: act.title, actCitation: act.citation ?? '' };
  }
  if (rest[0] === '00_Act') {
    return {
      kind: 'act',
      actId: multiActIdFor(d.id),
      docId: d.id,
      actTitle: d.multiParent ?? act.title,
      actCitation: act.citation ?? '',
    };
  }
  if (/^\d+_Regulations$/.test(rest[0])) {
    const m = d.title.match(/^(.*) - (\d+[A-Za-z]?\/\d{2,4})$/);
    return {
      kind: 'regulation',
      actId: d.id,
      docId: d.id,
      actTitle: m ? m[1] : d.title,
      actCitation: m ? `B.C. Reg. ${m[2]}` : '',
    };
  }
  return { kind: 'other', reason: rest[0].replace(/^\d+_/, '') };
}
