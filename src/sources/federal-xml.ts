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
    else if (c.name === 'Sup' || c.name === 'Sub') {
      // "3 m^2", "L_(ex,8)": plain text has no raised or lowered letters, and running them in ("m2") changes the text
      const t = inlineRaw(c.children).trim();
      s += (c.name === 'Sup' ? '^' : '_') + (/^[A-Za-z0-9]{1,3}$/.test(t) ? t : `(${t})`);
    } else if (c.name === 'LineBreak') s += BR;
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
  /** schedule: the schedule the section is an item of, if any */
  section: (node: XNode, location: string[], schedule: string | null) => void;
  heading?: (text: string, depth: number) => void;
};

// Provisions quoted by the law or by an amendment are not the law's own sections, wherever they appear.
const QUOTED = new Set(['ReadAsText', 'AmendedText', 'HistoricalNote', 'Identification']);

/** Headings are siblings of the sections they head (not containers), so the path is tracked by heading level. */
function walk(container: XNode, base: string[], v: Visit, schedule: string | null) {
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
    } else if (c.name === 'Section') v.section(c, location(), schedule);
    else if (c.name === 'Schedule') {
      if (notTheLaw(c)) continue;
      const title = scheduleTitle(c);
      v.heading?.(title, location().length);
      walk(c, [...location(), title], v, title);
    } else if (!QUOTED.has(c.name)) walk(c, location(), v, schedule);
  }
}

function walkLaw(doc: XNode, v: Visit) {
  const root = doc.children.find(isEl);
  if (!root) return;
  for (const c of root.children) {
    if (!isEl(c)) continue;
    if (c.name === 'Body') walk(c, [], v, null);
    else if (c.name === 'Schedule' && !notTheLaw(c)) {
      const title = scheduleTitle(c);
      v.heading?.(title, 0);
      walk(c, [title], v, title);
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
  /** "[Repealed …]" or "[Revoked …]" and nothing else. */
  repealed: boolean;
  /** Some other editorial placeholder and nothing else: "[Amendments]", "[Repeal]". */
  stub: boolean;
  range: boolean;
  /** The schedule this is an item of (SOR/86-304 Schedule V numbers its items 1, 2), or null for the body. */
  schedule: string | null;
};

const REPEALED_ONLY = /^\[(?:Repealed|Revoked)\b[^\]]*\]$/;
const NOTE_ONLY = /^\[[^\]]*\]$/;

function toSection(node: XNode, location: string[], schedule: string | null): FedSection {
  const labelNode = child(node, 'Label');
  const num = labelNode ? inlineText(labelNode) : '';
  const note = child(node, 'MarginalNote');
  const rest = renderFedSection(node).slice(num.length).trim();
  const repealed = REPEALED_ONLY.test(rest);
  return {
    node,
    num,
    heading: note ? inlineText(note) : null,
    location,
    nearestHeading: location.at(-1) ?? null,
    repealed,
    stub: !repealed && NOTE_ONLY.test(rest),
    range: /\s(?:to|and)\s/.test(num),
    schedule,
  };
}

/** The act's own sections, in order: the body and its schedules, not the related provisions or amendments not in force. */
export function bodySections(doc: XNode): FedSection[] {
  const out: FedSection[] = [];
  walkLaw(doc, { section: (node, location, schedule) => out.push(toSection(node, location, schedule)) });
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

// Every provision an amending instruction names: "section 1.4", "subsection 206.1(3)", "Sections 209 to 209.4",
// "paragraphs 206.6(1)(a) and (b)". Missing one means no warning at all, so this favours recall (code review 2026-09-26).
const NUMBER = String.raw`\d+(?:\.\d+)*(?:\s?\([^)\s]*\))*`; // "43 (2)" is written with a space too
const REFERENCE = new RegExp(String.raw`\b(?:sub)?(?:section|paragraph|subparagraph|clause)s?\s+(${NUMBER}(?:\s*(?:,|and|or|to)\s*(?:${NUMBER}|(?:\([^)\s]*\))+))*)`, 'gi');
// "… of the Canada Labour Code", "… of this Act", "… of the English version of the Act": the law a reference belongs to.
// A name is "Act" / "Regulations", or a title in capitals ("Helping Families in Need Act"); "the other Act" is neither.
const OF = /^\s+of\s+(this|these|that|those|the)\s+/i;
const NAMED = /^(?:(?:English|French) version of (?:the )?)?((?:Act|Regulations)\b|[A-Z][\w’'-]*(?:\s+(?:[A-Z][\w’'-]*|of|and|the|for|to|in|on))*)/;

/** The section numbers in "209 to 209.4", "181.1 and 181.2", "206.6(1)(a) and (b)"; a range is filled in from the act's own numbers. */
function numbersIn(list: string, own: string[]): string[] {
  const lead = (s: string | undefined) => s?.match(/^\d+(?:\.\d+)*/)?.[0];
  const parts = list.split(/\s*(,|\band\b|\bor\b|\bto\b)\s*/i); // item, separator, item, …
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const a = lead(parts[i]);
    if (!a) continue;
    const b = parts[i + 1]?.toLowerCase() === 'to' ? lead(parts[i + 2]) : undefined;
    if (b) {
      out.push(a, ...own.filter((n) => compareNums(a, n) < 0 && compareNums(n, b) < 0), b);
      i += 2;
    } else out.push(a);
  }
  return out;
}

/**
 * AMENDMENTS NOT IN FORCE: for each amending provision, the sections it would add, and the provisions of this act it names
 * ("section 35 of the Helping Families in Need Act", "section 310 of this Act" and "after section 154" are not counted).
 * An amendment that names none (a heading, a transitional provision) is kept, with no sections.
 */
export function notInForce(doc: XNode): NotInForce[] {
  const root = doc.children.find(isEl);
  const nif = root?.children.find((c): c is XNode => isEl(c) && c.name === 'Schedule' && c.attrs.id === 'NifProvs');
  if (!nif) return [];
  const info = fedDocInfo(doc);
  const own = bodySections(doc)
    .map((s) => s.num)
    .filter((n) => /^\d+(?:\.\d+)*$/.test(n));
  const isThisLaw = (after: string) => {
    const of = after.match(OF);
    if (!of) return true; // "(a) section 1.4;" in a list of this law's provisions
    const det = of[1].toLowerCase();
    if (det === 'this' || det === 'these') return false; // the amending act or regulations themselves
    if (det === 'that' || det === 'those') return true; // named earlier: cannot tell, so counted
    const named = after.slice(of[0].length).match(NAMED);
    if (!named) return false; // "the other Act"
    const name = named[1].replace(/(?:\s+(?:of|and|the|for|to|in|on))+$/, '').toLowerCase();
    if (name === 'act') return info.kind === 'act'; // in a regulation, "the Act" is the act it is made under
    if (name === 'regulations') return info.kind === 'regulation';
    return name === (info.title ?? '').toLowerCase();
  };
  // A number is this law's only if it is one of its sections, or one a pending amendment would add: transitional
  // provisions also name the amending act's own sections ("on the day on which section 357 comes into force").
  const pendingAdded = allOf(nif, 'AmendedText').flatMap((t) => allOf(t, 'Section').map((s) => (child(s, 'Label') ? inlineText(child(s, 'Label')!) : '')));
  const known = new Set([...own, ...pendingAdded]);
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
      for (const m of said.matchAll(REFERENCE)) {
        const start = m.index ?? 0;
        const before = said.slice(Math.max(0, start - 10), start);
        if (/\b(?:after|before)\s+$/i.test(before)) continue; // "adding the following after section 154"
        if (/\b(?:that|those|this|these)\s+$/i.test(before)) continue; // "as enacted by that section 452": named before
        if (!isThisLaw(said.slice(start + m[0].length))) continue;
        for (const n of numbersIn(m[1], own)) if (known.has(n)) nums.add(n);
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
    section: (node, location, schedule) => {
      const s = toSection(node, location, schedule);
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
  /** Terms the section defines (inside <Definition>, not a reference such as "the definition … in section 2"). */
  definedTerms: string[];
  schedule: string | null;
  /** in-force="no" on the whole section, or on a part of it (shaded on the official page). */
  notInForce: 'whole' | 'part' | null;
};

function allOf(n: XNode, name: string): XNode[] {
  return n.children.flatMap((c) => (!isEl(c) ? [] : c.name === name ? [c, ...allOf(c, name)] : allOf(c, name)));
}

/** Numbered sections, for search: no ranges, and nothing that only holds an editorial note ("[Repealed…]", "[Amendments]"). */
export function sectionRecords(doc: XNode): SectionRecord[] {
  return bodySections(doc)
    .filter((s) => /^\d/.test(s.num) && !s.range && !s.repealed && !s.stub)
    .map((s) => ({
      num: s.num,
      heading: s.heading,
      nearestHeading: s.nearestHeading,
      location: s.location,
      text: renderFedSection(s.node),
      notes: allOf(s.node, 'MarginalNote')
        .map((m) => inlineText(m))
        .join(' | '),
      definedTerms: allOf(s.node, 'Definition').flatMap((d) => allOf(d, 'DefinedTermEn').map((t) => inlineText(t))),
      schedule: s.schedule,
      notInForce: s.node.attrs['in-force'] === 'no' ? 'whole' : hasNotInForcePart(s.node) ? 'part' : null,
    }));
}
