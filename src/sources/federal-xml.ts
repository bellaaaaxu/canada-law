// Justice Laws XML (acts and regulations of Canada): facts about the document, its sections and where they sit,
// their text laid out the way the official page lays it out, the table of contents, and the amendments not in force.
// What this XML does that its documentation leaves out is recorded in SPEC.md ("联邦（Justice Laws）").
import { child, isEl, type XChild, type XNode } from './xml.js';

// ---------- inline text ----------

const BR = ''; // private-use sentinel for a forced line break (as in bc-xml.ts; JS \s would swallow U+2028)

function inlineRaw(nodes: XChild[]): string {
  let s = '';
  for (const c of nodes) {
    if (!isEl(c)) {
      s += c;
      continue;
    }
    if (c.name === 'HistoricalNote' || c.name === 'MarginalNote' || c.name === 'Footnote' || c.name === 'FootnoteRef' || c.name === 'PageBreak') continue;
    if (c.name === 'DefinedTermEn') s += `"${inlineRaw(c.children).trim()}"`;
    else if (c.name === 'Repealed') s += (s !== '' && !/\s$/.test(s) ? ' ' : '') + inlineRaw(c.children);
    else if (c.name === 'LineBreak') s += BR;
    else if (c.name === 'Leader' || c.name === 'LeaderRightJustified') s += ' ';
    else if (c.name === 'ImageGroup' || c.name === 'Image') s += '[image omitted: see source_url]';
    else s += inlineRaw(c.children);
  }
  return s;
}

const tidy = (raw: string) =>
  raw
    .replace(/\s+/g, ' ')
    .replace(new RegExp(` ?${BR} ?`, 'g'), '\n')
    .trim();
const inlineText = (n: XNode) => tidy(inlineRaw(n.children));
const indent = (depth: number) => '  '.repeat(depth);

// ---------- section text ----------

// Blocks with a label of their own; a Subsection sits at its section's depth, the others one level further in.
const BLOCKS = new Set(['Subsection', 'Paragraph', 'Subparagraph', 'Clause', 'Subclause', 'Subsubclause', 'Definition', 'Provision', 'Item', 'FormulaParagraph']);

export type RenderOpts = { mark?: RegExp };

/**
 * Plain text of one section, laid out like the official page: "169.1 (1) …", "(2) …", "  (a) …"; each definition on
 * its own line with the term in quotes. Marginal notes and amendment history are left out: they are not part of the law.
 * A part marked in-force="no" (shaded on the official page) starts with "[Not in force]".
 */
export function renderFedSection(section: XNode, o: RenderOpts = {}): string {
  const lines = renderBlock(section, 0);
  return (o.mark ? lines.map((l) => l.replace(o.mark!, (m) => `**${m}**`)) : lines).join('\n');
}

function renderBlock(node: XNode, depth: number): string[] {
  const lines: string[] = [];
  const labelNode = child(node, 'Label');
  const label = labelNode ? inlineText(labelNode) : '';
  let cur: string | null = label;

  const flush = () => {
    if (cur !== null && tidy(cur) !== '') lines.push(...tidy(cur).split('\n').map((l) => indent(depth) + l));
    cur = null;
  };
  const append = (s: string) => {
    if (cur === null) cur = '';
    cur += cur.trim() !== '' && s.trim() !== '' && !/^\s/.test(s) ? ' ' + s : s;
  };
  const block = (ls: string[]) => {
    flush();
    lines.push(...ls);
  };

  for (const c of node.children) {
    if (!isEl(c)) {
      if (c.trim()) append(c);
      continue;
    }
    if (c.name === 'Label' || c.name === 'MarginalNote' || c.name === 'HistoricalNote' || c.name === 'FootnoteRef') continue;
    if (c.name === 'Text') append(inlineRaw(c.children));
    else if (BLOCKS.has(c.name)) {
      const childDepth = c.name === 'Subsection' ? depth : depth + 1;
      const childLines = renderBlock(c, childDepth);
      if (label && cur !== null && tidy(cur) === label && childLines.length > 0 && childDepth === depth) {
        // "169.1" + "(1) Every employee…" → "169.1 (1) Every employee…", as on the official page
        childLines[0] = indent(depth) + label + ' ' + childLines[0].trimStart();
        cur = null;
      } else flush();
      lines.push(...childLines);
    } else if (c.name.startsWith('Continued')) {
      // text that carries on after a list: "…(b) …; and the employer shall …"
      const t = inlineText(c);
      if (t) block([indent(depth) + t]);
    } else if (c.name === 'ReadAsText' || c.name === 'AmendedText') block(quoted(c, depth + 1));
    else if (c.name === 'Section') block(renderBlock(c, depth + 1));
    else if (c.name === 'List') block(c.children.filter(isEl).flatMap((i) => renderBlock(i, depth + 1)));
    else if (c.name === 'TableGroup' || c.name === 'table') block(renderTable(c, depth));
    else if (c.name === 'FormulaGroup') block(renderFormula(c, depth));
    else if (c.name === 'Footnote') {
      const l = child(c, 'Label');
      const body = tidy(inlineRaw(c.children.filter((x) => !(isEl(x) && x.name === 'Label'))));
      block([`${indent(depth)}[footnote${l ? ' ' + inlineText(l) : ''}] ${body}`.trimEnd()]);
    } else if (c.name === 'ImageGroup') block([indent(depth) + '[image omitted: see source_url]']);
    else append(inlineRaw([c]));
  }
  flush();
  if (node.attrs['in-force'] === 'no' && lines.length > 0) lines[0] = indent(depth) + '[Not in force] ' + lines[0].trimStart();
  return lines;
}

/** Text that a provision quotes (a regulation "modifying" a section of its act), one level in. */
function quoted(n: XNode, depth: number): string[] {
  return n.children.filter(isEl).flatMap((c) => {
    if (c.name === 'Section' || BLOCKS.has(c.name)) return renderBlock(c, depth);
    if (c.name === 'Heading') return [indent(depth) + headingText(c)];
    const t = inlineText(c);
    return t ? [indent(depth) + t] : [];
  });
}

function renderTable(table: XNode, depth: number): string[] {
  const lines: string[] = [];
  const walk = (n: XNode) => {
    for (const c of n.children) {
      if (!isEl(c)) continue;
      if (c.name === 'title' || c.name === 'Caption') lines.push(indent(depth) + inlineText(c));
      else if (c.name === 'row') lines.push(indent(depth) + c.children.filter(isEl).map((e) => tidy(inlineRaw(e.children))).join(' | '));
      else walk(c);
    }
  };
  walk(table);
  return lines.filter((l) => l.trim() !== '');
}

function renderFormula(group: XNode, depth: number): string[] {
  return group.children.filter(isEl).flatMap((c) => {
    if (c.name === 'FormulaDefinition') {
      const term = child(c, 'FormulaTerm');
      const rest = c.children.filter((x) => !(isEl(x) && x.name === 'FormulaTerm'));
      return [indent(depth) + tidy(`${term ? inlineText(term) : ''} ${inlineRaw(rest)}`)];
    }
    if (BLOCKS.has(c.name)) return renderBlock(c, depth + 1);
    const t = inlineText(c);
    return t ? [indent(depth) + t] : [];
  });
}

// ---------- where sections sit ----------

function headingText(h: XNode): string {
  const label = child(h, 'Label');
  const title = child(h, 'TitleText');
  const note = child(h, 'Note');
  const text = [label ? inlineText(label) : '', title ? inlineText(title) : ''].filter(Boolean).join(' — ');
  return (note ? `${text} ${inlineText(note)}` : text).trim();
}

/** "SCHEDULE I (Section 27) Notice …": label, originating reference and title, as the official page shows them. */
function scheduleTitle(s: XNode): string {
  const h = child(s, 'ScheduleFormHeading');
  const text = h ? h.children.filter(isEl).map(inlineText).filter(Boolean).join(' ') : '';
  return text || 'Schedule';
}

/** The two schedules after the body that are not the act's own text: RELATED PROVISIONS and AMENDMENTS NOT IN FORCE. */
const notTheLaw = (s: XNode) => s.attrs.id === 'RelatedProvs' || s.attrs.id === 'NifProvs';

type Visit = {
  section: (node: XNode, location: string[]) => void;
  heading?: (text: string, depth: number) => void;
};

/** Headings are siblings of the sections they head (not containers), so the path is tracked by heading level. */
function walk(container: XNode, base: string[], v: Visit) {
  let stack: { level: number; text: string }[] = [];
  const location = () => [...base, ...stack.map((s) => s.text)];
  for (const c of container.children) {
    if (!isEl(c)) continue;
    if (c.name === 'Heading') {
      const level = Number(c.attrs.level ?? 1);
      const text = headingText(c);
      stack = stack.filter((s) => s.level < level);
      if (text) {
        stack.push({ level, text });
        v.heading?.(text, location().length - 1);
      }
    } else if (c.name === 'Section') v.section(c, location());
    else if (c.name === 'Schedule') {
      if (notTheLaw(c)) continue;
      const title = scheduleTitle(c);
      v.heading?.(title, location().length);
      walk(c, [...location(), title], v);
    } else if (c.name !== 'HistoricalNote' && c.name !== 'Identification') walk(c, location(), v);
  }
}

function walkLaw(doc: XNode, v: Visit) {
  const root = doc.children.find(isEl);
  if (!root) return;
  for (const c of root.children) {
    if (!isEl(c)) continue;
    if (c.name === 'Body') walk(c, [], v);
    else if (c.name === 'Schedule' && !notTheLaw(c)) {
      const title = scheduleTitle(c);
      v.heading?.(title, 0);
      walk(c, [title], v);
    }
  }
}

export type FedSection = {
  node: XNode;
  /** As printed: "166", "169.1", or a range such as "163 to 165". */
  num: string;
  /** The section's marginal note. */
  heading: string | null;
  /** Enclosing Part / Division / headings / schedule, outermost first. */
  location: string[];
  nearestHeading: string | null;
  repealed: boolean;
  range: boolean;
};

const REPEALED_ONLY = /^\[Repealed\b[^\]]*\]$/;

function toSection(node: XNode, location: string[]): FedSection {
  const labelNode = child(node, 'Label');
  const num = labelNode ? inlineText(labelNode) : '';
  const note = child(node, 'MarginalNote');
  return {
    node,
    num,
    heading: note ? inlineText(note) : null,
    location,
    nearestHeading: location.at(-1) ?? null,
    repealed: REPEALED_ONLY.test(renderFedSection(node).slice(num.length).trim()),
    range: /\s(?:to|and)\s/.test(num),
  };
}

/** The act's own sections, in order: the body and its schedules, not the related provisions or amendments not in force. */
export function bodySections(doc: XNode): FedSection[] {
  const out: FedSection[] = [];
  walkLaw(doc, { section: (node, location) => out.push(toSection(node, location)) });
  return out;
}

const parts = (n: string) => n.split('.').map((p) => parseInt(p, 10));
function compareNums(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

function inRange(label: string, num: string): boolean {
  const to = label.match(/^([\d.]+) to ([\d.]+)$/);
  if (to) return compareNums(to[1], num) <= 0 && compareNums(num, to[2]) <= 0;
  return label.split(/,\s*|\s+and\s+/).includes(num);
}

/** Every section with this number (a schedule can repeat a number); failing that, a range such as "163 to 165" holding it. */
export function findFedSections(sections: FedSection[], num: string): FedSection[] {
  const exact = sections.filter((s) => s.num === num);
  return exact.length > 0 ? exact : sections.filter((s) => s.range && inRange(s.num, num));
}

export function hasNotInForcePart(node: XNode): boolean {
  return node.attrs['in-force'] === 'no' || node.children.some((c) => isEl(c) && hasNotInForcePart(c));
}

// ---------- document facts ----------

export type FedDocInfo = {
  kind: 'act' | 'regulation' | 'unknown';
  title: string | null;
  /** Regulations: "C.R.C., c. 986", "SOR/2021-200". */
  instrumentNumber: string | null;
  /** The XML's last-amended date; the official page shows the same date when both are the same version. */
  lastAmended: string | null;
  /** Every section reads "[Repealed…]". The root still says in-force="yes" and the official list does not mark it. */
  allRepealed: boolean;
  readerNote: string | null;
};

export function fedDocInfo(doc: XNode): FedDocInfo {
  const root = doc.children.find(isEl);
  const kind = root?.name === 'Statute' ? 'act' : root?.name === 'Regulation' ? 'regulation' : 'unknown';
  const ident = root ? child(root, 'Identification') : undefined;
  const text = (name: string) => {
    const n = ident ? child(ident, name) : undefined;
    return n ? inlineText(n) || null : null;
  };
  const numbered = bodySections(doc).filter((s) => /^\d/.test(s.num));
  return {
    kind,
    title: text('ShortTitle') ?? text('LongTitle'),
    instrumentNumber: text('InstrumentNumber'),
    lastAmended: root?.attrs['lims:lastAmendedDate'] ?? null,
    allRepealed: numbered.length > 0 && numbered.every((s) => s.repealed),
    readerNote: text('ReaderNote'),
  };
}

// ---------- amendments not in force ----------

export type NotInForce = { citation: string; sections: string[] };

/**
 * The words of an amending provision, leaving out the text it would insert. Elements are spaced apart: the XML has
 * <Label>482</Label><Text>Section 228 …</Text>, which would otherwise read "482Section".
 */
function instruction(n: XNode): string {
  return n.children
    .map((c) => (!isEl(c) ? c : c.name === 'AmendedText' || c.name === 'HistoricalNote' || c.name === 'Footnote' ? ' ' : ` ${instruction(c)} `))
    .join('');
}

// "subsection 206.1(3) of the Canada Labour Code is replaced": the provision named right before "is replaced / amended /
// repealed". The words in between may not name another provision, or "section 35 of the Helping Families in Need Act has
// produced its effects and … subsection 206.1(3) … is replaced" would be read as section 35.
const PROVISION = String.raw`\b(?:sub)?(?:section|paragraph|subparagraph|clause)s?\b`;
const CHANGED = new RegExp(String.raw`(${PROVISION}\s(?:(?!${PROVISION})[^:;])*?)\s(?:is|are)\s(?:replaced|amended|repealed)\b`, 'gi');

/**
 * AMENDMENTS NOT IN FORCE: for each amending provision, the sections it would add and the sections it says it replaces,
 * amends or repeals ("adding the following after section 154" does not count 154).
 */
export function notInForce(doc: XNode): NotInForce[] {
  const root = doc.children.find(isEl);
  const nif = root?.children.find((c): c is XNode => isEl(c) && c.name === 'Schedule' && c.attrs.id === 'NifProvs');
  if (!nif) return [];
  const out: NotInForce[] = [];
  const collect = (n: XNode) => {
    for (const c of n.children) {
      if (!isEl(c)) continue;
      if (c.name !== 'RelatedOrNotInForce') {
        collect(c);
        continue;
      }
      const h = child(c, 'Heading');
      const citation = h ? headingText(h).replace(/^[\s—–-]+/, '') : '';
      const nums = new Set<string>();
      const added = (x: XNode, inAmended: boolean) => {
        for (const k of x.children) {
          if (!isEl(k)) continue;
          if (inAmended && k.name === 'Section') {
            const l = child(k, 'Label');
            if (l) nums.add(inlineText(l));
          }
          added(k, inAmended || k.name === 'AmendedText');
        }
      };
      const said = tidy(instruction(c));
      for (const m of said.matchAll(CHANGED)) {
        for (const d of m[1].split(/\sof\s/)[0].matchAll(/(?<![\w.(])(\d+(?:\.\d+)*)/g)) nums.add(d[1]);
      }
      added(c, false);
      out.push({ citation, sections: [...nums] });
    }
  };
  collect(nif);
  return out;
}

// ---------- table of contents ----------

export function fedToc(doc: XNode): string {
  const lines: string[] = [];
  walkLaw(doc, {
    heading: (text, depth) => lines.push(indent(depth) + text),
    section: (node, location) => {
      const s = toSection(node, location);
      if (s.num !== '') lines.push(`${indent(location.length)}${s.num}  ${s.heading ?? (s.repealed ? 'Repealed' : '')}`.trimEnd());
    },
  });
  return lines.join('\n');
}

// ---------- what search reads ----------

export type SectionRecord = {
  num: string;
  heading: string | null;
  nearestHeading: string | null;
  location: string[];
  /** The section as renderFedSection lays it out. */
  text: string;
  /** Every marginal note in the section, the subsections' included (" | " between them). */
  notes: string;
  definedTerms: string[];
};

function allOf(n: XNode, name: string): XNode[] {
  return n.children.flatMap((c) => (!isEl(c) ? [] : c.name === name ? [c, ...allOf(c, name)] : allOf(c, name)));
}

/** Numbered sections in force, for search: no ranges, no "[Repealed…]" stubs. */
export function sectionRecords(doc: XNode): SectionRecord[] {
  return bodySections(doc)
    .filter((s) => /^\d/.test(s.num) && !s.range && !s.repealed)
    .map((s) => ({
      num: s.num,
      heading: s.heading,
      nearestHeading: s.nearestHeading,
      location: s.location,
      text: renderFedSection(s.node),
      notes: allOf(s.node, 'MarginalNote')
        .map((m) => inlineText(m))
        .join(' | '),
      definedTerms: allOf(s.node, 'DefinedTermEn').map((d) => inlineText(d)),
    }));
}
