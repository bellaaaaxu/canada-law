// BC Laws legislative XML: parse, find sections, render text the way the official page lays it out,
// build a table of contents, and read hits out of in-document search results.
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

const isEl = (c: XChild | undefined): c is XNode => typeof c === 'object' && c !== null;
const child = (n: XNode, name: string) => n.children.find((c): c is XNode => isEl(c) && c.name === name);

// ---------- inline text ----------

const BR = ''; // private-use sentinel for a forced line break (JS \s would swallow U+2028)

const CHARS: Record<string, string> = {
  'in:eacute': 'é',
  'in:EACUTE': 'É',
  'in:aacute': 'á',
  'in:AACUTE': 'Á',
  'in:agrave': 'à',
  'in:AGRAVE': 'À',
  'in:rsquo': "'",
  'in:degree': '°',
};

type RenderOpts = { markHits?: boolean };

function inlineRaw(nodes: XChild[], o: RenderOpts): string {
  let s = '';
  for (const c of nodes) {
    if (!isEl(c)) {
      s += c;
      continue;
    }
    const inner = () => inlineRaw(c.children, o);
    if (c.name in CHARS) s += CHARS[c.name];
    else if (c.name === 'in:char') s += c.attrs.type === 'mdash' ? '—' : c.attrs.type === 'ndash' ? '-' : '';
    else if (c.name === 'in:term' || c.name === 'in:doublequoted') s += `"${inner()}"`;
    else if (c.name === 'in:singlequoted') s += `'${inner()}'`;
    else if (c.name === 'in:br' || c.name === 'in:hr') s += BR;
    else if (c.name === 'in:graphic') s += '[graphic omitted: see source_url]';
    else if (c.name === 'hit') s += o.markHits ? `**${inner()}**` : inner();
    else s += inner();
  }
  return s;
}

function tidy(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(new RegExp(` ?${BR} ?`, 'g'), '\n')
    .trim();
}

export const inlineText = (n: XNode, o: RenderOpts = {}) => tidy(inlineRaw(n.children, o));

// ---------- section text ----------

const LIST_BLOCKS = new Set([
  'bcl:subsection',
  'bcl:paragraph',
  'bcl:subparagraph',
  'bcl:clause',
  'bcl:subclause',
  'bcl:definition',
]);
const LINE_BLOCKS = new Set(['bcl:hnote', 'bcl:centertext', 'bcl:lefttext', 'bcl:righttext', 'bcl:scheduletitle']);

const indent = (depth: number) => '  '.repeat(depth);

/** Plain text of one section, laid out like the official page: "40 (1) …", "  (a) …", "(2) …". Marginal note excluded. */
export function renderSection(section: XNode, o: RenderOpts = {}): string {
  return renderBlock(section, 0, true, o).join('\n');
}

function renderBlock(node: XNode, depth: number, isSection: boolean, o: RenderOpts): string[] {
  const lines: string[] = [];
  const numNode = child(node, 'bcl:num');
  const label = numNode ? (isSection ? inlineText(numNode) : `(${inlineText(numNode)})`) : '';
  let cur: string | null = label;

  const flush = () => {
    if (cur !== null && cur.trim() !== '') lines.push(indent(depth) + tidy(cur));
    cur = null;
  };
  const append = (s: string, spaced: boolean) => {
    if (cur === null) cur = '';
    cur += spaced && cur.trim() !== '' ? ' ' + s : s;
  };

  for (const c of node.children) {
    if (!isEl(c)) append(c, false);
    else if (c.name === 'bcl:num' || c.name === 'bcl:marginalnote') continue;
    else if (c.name === 'bcl:text') append(inlineRaw(c.children, o), true);
    else if (LIST_BLOCKS.has(c.name)) {
      const childDepth = c.name === 'bcl:subsection' ? depth : depth + 1;
      const childLines = renderBlock(c, childDepth, false, o);
      if (label && cur !== null && tidy(cur) === label && childLines.length > 0 && childDepth === depth) {
        // "40" + "(1) An employer…" → "40 (1) An employer…", as on the official page
        childLines[0] = indent(depth) + label + ' ' + childLines[0].trimStart();
        cur = null;
      } else flush();
      lines.push(...childLines);
    } else if (LINE_BLOCKS.has(c.name)) {
      flush();
      const t = inlineText(c, o);
      if (t) lines.push(indent(depth) + t);
    } else if (c.name === 'oasis:table') {
      flush();
      lines.push(...renderTable(c, depth, o));
    } else append(inlineRaw([c], o), false);
  }
  flush();
  return lines;
}

function renderTable(table: XNode, depth: number, o: RenderOpts): string[] {
  const lines: string[] = [];
  const walk = (n: XNode) => {
    for (const c of n.children) {
      if (!isEl(c)) continue;
      if (c.name === 'oasis:tcaption') lines.push(indent(depth) + inlineText(c, o));
      else if (c.name === 'oasis:trow') {
        const cells = c.children.filter(isEl).map((e) => inlineText(e, o));
        lines.push(indent(depth) + cells.join(' | '));
      } else walk(c);
    }
  };
  walk(table);
  return lines;
}

// ---------- finding sections ----------

export type SectionMatch = {
  node: XNode;
  num: string;
  heading: string | null;
  /** Enclosing Part / Division / Schedule, outermost first, e.g. ["Part 4 — Hours of Work and Overtime"]. */
  location: string[];
  /** For a multi-document act: the id of the part document (act:content/@id) holding this section. */
  partDocId: string | null;
};

const sectionNum = (s: XNode) => {
  const n = child(s, 'bcl:num');
  return n ? inlineText(n) : '';
};
const sectionHeading = (s: XNode) => {
  const m = child(s, 'bcl:marginalnote');
  return m ? inlineText(m) : null;
};

function containerLabel(n: XNode): string | null {
  const num = child(n, 'bcl:num');
  const text = child(n, 'bcl:text');
  const numStr = num ? inlineText(num) : '';
  const title = text ? inlineText(text) : '';
  if (n.name === 'bcl:part') return `Part ${numStr}${title ? ' — ' + title : ''}`.trim();
  if (n.name === 'bcl:division') return `Division ${numStr}${title ? ' — ' + title : ''}`.trim();
  if (n.name === 'bcl:schedule') {
    const t = child(n, 'bcl:scheduletitle');
    return t ? inlineText(t) : 'Schedule';
  }
  return null;
}

type Ctx = { location: string[]; partDocId: string | null };

function walkSections(n: XNode, ctx: Ctx, visit: (s: XNode, ctx: Ctx) => void) {
  for (const c of n.children) {
    if (!isEl(c)) continue;
    if (c.name === 'bcl:section') {
      visit(c, ctx);
      continue;
    }
    const label = containerLabel(c);
    const next: Ctx = {
      location: label ? [...ctx.location, label] : ctx.location,
      partDocId: c.name === 'act:content' && c.attrs.id ? c.attrs.id : ctx.partDocId,
    };
    walkSections(c, next, visit);
  }
}

export function findSections(doc: XNode, num: string): SectionMatch[] {
  const wanted = num.trim();
  const out: SectionMatch[] = [];
  walkSections(doc, { location: [], partDocId: null }, (s, ctx) => {
    if (sectionNum(s) === wanted) {
      out.push({ node: s, num: wanted, heading: sectionHeading(s), location: ctx.location, partDocId: ctx.partDocId });
    }
  });
  return out;
}

// ---------- table of contents ----------

export type TocEntry = {
  kind: 'part' | 'division' | 'schedule' | 'section';
  num: string | null;
  title: string | null;
  depth: number;
  partDocId: string | null;
};

export function buildToc(doc: XNode): TocEntry[] {
  const out: TocEntry[] = [];
  const walk = (n: XNode, depth: number, partDocId: string | null) => {
    for (const c of n.children) {
      if (!isEl(c)) continue;
      if (c.name === 'bcl:section') {
        out.push({ kind: 'section', num: sectionNum(c), title: sectionHeading(c), depth, partDocId });
      } else if (c.name === 'bcl:part' || c.name === 'bcl:division') {
        const num = child(c, 'bcl:num');
        const text = child(c, 'bcl:text');
        out.push({
          kind: c.name === 'bcl:part' ? 'part' : 'division',
          num: num ? inlineText(num) : null,
          title: text ? inlineText(text) : null,
          depth,
          partDocId,
        });
        walk(c, depth + 1, partDocId);
      } else if (c.name === 'bcl:schedule') {
        out.push({ kind: 'schedule', num: null, title: containerLabel(c), depth, partDocId });
        walk(c, depth + 1, partDocId);
      } else {
        walk(c, depth, c.name === 'act:content' && c.attrs.id ? c.attrs.id : partDocId);
      }
    }
  };
  walk(doc, 0, null);
  return out;
}

export function renderToc(entries: TocEntry[]): string {
  return entries
    .map((e) => {
      const pad = indent(e.depth);
      if (e.kind === 'part') return `${pad}Part ${e.num ?? ''}${e.title ? ' — ' + e.title : ''}`;
      if (e.kind === 'division') return `${pad}Division ${e.num ?? ''}${e.title ? ' — ' + e.title : ''}`;
      if (e.kind === 'schedule') return `${pad}${e.title ?? 'Schedule'}`;
      return `${pad}${e.num}  ${e.title ?? ''}`.trimEnd();
    })
    .join('\n');
}

// ---------- document-level facts ----------

export type DocInfo = {
  kind: 'act' | 'regulation' | 'unknown';
  title: string | null;
  regnum: string | null;
  /** Root @status, e.g. "Repealed" / "Replaced". Current acts have none. */
  status: string | null;
  /** <act:repealedtext>: the repeal notice on a stub, but on a current act just an official note (e.g. Workers Compensation Act). */
  repealedText: string | null;
};

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

export function docInfo(doc: XNode): DocInfo {
  const root = doc.children.find(isEl);
  if (!root) return { kind: 'unknown', title: null, regnum: null, status: null, repealedText: null };
  const kind = root.name === 'act:act' ? 'act' : root.name === 'reg:regulation' ? 'regulation' : 'unknown';
  const text = (name: string) => {
    const n = child(root, name);
    return n ? inlineText(n) : null;
  };
  return {
    kind,
    title: text(kind === 'regulation' ? 'reg:title' : 'act:title'),
    regnum: text('reg:regnum'),
    status: root.attrs.status ?? null,
    repealedText: text('act:repealedtext'),
  };
}

// ---------- in-document search results ----------

export type SectionHits = {
  num: string;
  heading: string | null;
  totalHits: number;
  headingHit: boolean;
  headingStartsWithHit: boolean;
  /** A hit is a whole defined term, e.g. "statutory holiday" defined in s.1. */
  definedTermExact: boolean;
  /** A hit sits inside a longer defined term, e.g. "overtime" in "overtime wages". */
  definedTermPartial: boolean;
  snippet: string;
};

export function analyzeHitSections(doc: XNode): SectionHits[] {
  const out: SectionHits[] = [];
  walkSections(doc, { location: [], partDocId: null }, (s) => {
    let totalHits = 0;
    let headingHit = false;
    let definedTermExact = false;
    let definedTermPartial = false;

    const scan = (n: XNode, inHeading: boolean, term: XNode | null) => {
      for (const c of n.children) {
        if (!isEl(c)) continue;
        if (c.name === 'hit') {
          totalHits++;
          if (inHeading) headingHit = true;
          if (term) {
            if (inlineText(term).toLowerCase() === inlineText(c).toLowerCase()) definedTermExact = true;
            else definedTermPartial = true;
          }
        }
        scan(c, inHeading || c.name === 'bcl:marginalnote', c.name === 'in:term' ? c : term);
      }
    };
    scan(s, false, null);

    const note = child(s, 'bcl:marginalnote');
    const firstInNote = note?.children.find((c) => isEl(c) || c.trim() !== '');
    const headingStartsWithHit = isEl(firstInNote) && firstInNote.name === 'hit';

    out.push({
      num: sectionNum(s),
      heading: sectionHeading(s),
      totalHits,
      headingHit,
      headingStartsWithHit,
      definedTermExact,
      definedTermPartial,
      snippet: makeSnippet(s),
    });
  });
  return out;
}

// A short section comes whole; a long one is cut to the whole clause around the first hit, never mid-sentence.
// D3 run 4 (2026-09-26): the s.44 snippet stopped at "or (b) worked under an…", and answers made up the rest.
const WHOLE_SECTION = 600; // characters; most Employment Standards Act sections are shorter
const MAX_BEFORE = 300; // from the start of the hit's clause to the hit
const MAX_AFTER = 450; // from the hit to the end of its clause

function makeSnippet(section: XNode): string {
  const body = tidy(renderSection(section, { markHits: true }).replace(/\n/g, ' '));
  const pos = body.indexOf('**');
  if (pos === -1) {
    const note = child(section, 'bcl:marginalnote');
    return note ? inlineText(note, { markHits: true }) : body.slice(0, 240);
  }
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
