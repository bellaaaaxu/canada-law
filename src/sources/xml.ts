// What BC Laws and Justice Laws XML have in common: an order-preserving parse (legislative text is mixed
// content), small tree helpers, and how a search snippet is cut from a section's text.
import { XMLParser } from 'fast-xml-parser';

export type XNode = { name: string; attrs: Record<string, string>; children: XChild[] };
export type XChild = XNode | string;

const parser = new XMLParser({
  preserveOrder: true, // legislative text is mixed content: text and inline elements must stay in order
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false, // keep "40" and "52.10" as strings
  parseAttributeValue: false,
  ignorePiTags: true, // <?amendment-start …?> markers: drop the marker, keep the words
  ignoreDeclaration: true,
  processEntities: true,
  htmlEntities: true,
});

export function parseXml(xml: string): XNode {
  return { name: '#document', attrs: {}, children: convert(parser.parse(xml) as unknown[]) };
}

function convert(items: unknown[]): XChild[] {
  const out: XChild[] = [];
  for (const item of items as Record<string, unknown>[]) {
    const key = Object.keys(item).find((k) => k !== ':@');
    if (!key || key.startsWith('?') || key === '#comment') continue;
    if (key === '#text') {
      out.push(String(item[key]));
      continue;
    }
    const attrs = (item[':@'] as Record<string, string> | undefined) ?? {};
    out.push({ name: key, attrs, children: convert((item[key] as unknown[]) ?? []) });
  }
  return out;
}

export const isEl = (c: XChild | undefined): c is XNode => typeof c === 'object' && c !== null;
export const child = (n: XNode, name: string) => n.children.find((c): c is XNode => isEl(c) && c.name === name);

/** First element with this name, depth-first (e.g. the act:act inside an xpath <snippet>). */
export function findElement(n: XNode, name: string): XNode | null {
  for (const c of n.children) {
    if (!isEl(c)) continue;
    if (c.name === name) return c;
    const deeper = findElement(c, name);
    if (deeper) return deeper;
  }
  return null;
}

// ---------- search snippets ----------

// A short section comes whole; a long one is cut to the whole clause around the first hit, never mid-sentence.
// D3 run 4 (2026-09-26): the s.44 snippet stopped at "or (b) worked under an…", and answers made up the rest.
const WHOLE_SECTION = 600; // characters; most Employment Standards Act sections are shorter
const MAX_BEFORE = 300; // from the start of the hit's clause to the hit
const MAX_AFTER = 450; // from the hit to the end of its clause

/** body: the section's text on one line, hits wrapped in **…**. Without a hit, whenNoHit() is the snippet. */
export function cutSnippet(body: string, whenNoHit: () => string): string {
  const pos = body.indexOf('**');
  if (pos === -1) return whenNoHit();
  if (body.length <= WHOLE_SECTION) return body;

  // Start just after the clause end (". " or "; ") before the hit, or at the section start; failing both, a word boundary.
  const clauseEnd = Math.max(body.lastIndexOf('. ', pos), body.lastIndexOf('; ', pos));
  let start: number;
  if (clauseEnd !== -1 && pos - clauseEnd <= MAX_BEFORE) start = clauseEnd + 2;
  else if (pos <= MAX_BEFORE) start = 0;
  else {
    const sp = body.indexOf(' ', pos - 90);
    start = sp !== -1 && sp < pos ? sp + 1 : pos - 90;
  }
  // End at the first clause end after the hit; failing that, a word boundary.
  const hitEnd = body.indexOf('**', pos + 2) + 2;
  const next = /[.;](?=\s|$)/.exec(body.slice(hitEnd));
  let end: number;
  if (next && hitEnd + next.index + 1 - pos <= MAX_AFTER) end = hitEnd + next.index + 1;
  else {
    const sp = body.lastIndexOf(' ', pos + 150);
    end = sp > hitEnd ? sp : Math.min(body.length, pos + 150);
  }
  return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
}
