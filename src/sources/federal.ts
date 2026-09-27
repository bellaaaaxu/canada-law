// Justice Laws client (acts and regulations of Canada): find acts, read tables of contents and sections.
// The website's behaviour, including what its documentation leaves out, is recorded in SPEC.md ("联邦（Justice Laws）").
import type { FetchResult, Fetcher } from '../http.js';
import { FEDERAL_NOTICE } from '../notice.js';
import { ToolError } from '../tool-error.js';
import type { ActCandidate, Citation, SearchResult } from '../types.js';
import { CURRENT_TO_WARNING, LITERAL_NOTE, SNIPPET_NOTE, mapLimit, normalizeSection } from './bc.js';
import { FED_BASE, normalizeFedId, parseFedPage, parseLegis, type FedPageMeta, type LegisEntry } from './federal-meta.js';
import {
  bodySections,
  fedDocInfo,
  fedToc,
  findFedSections,
  hasNotInForcePart,
  notInForce,
  renderFedSection,
  sectionRecords,
  type FedDocInfo,
  type SectionRecord,
} from './federal-xml.js';
import { cutSnippet, parseXml, type XNode } from './xml.js';

const CONCURRENCY = 4;
/** Search covers this act and the regulations the official list puts under it (SPEC 2026-09-26). */
const SEARCHED_ACT = 'L-2';
const LEGIS_URL = `${FED_BASE}/eng/XML/Legis.xml`;
const xmlUrl = (id: string) => `${FED_BASE}/eng/XML/${id}.xml`;
const folder = (kind: FedDocInfo['kind'] | LegisEntry['kind']) => (kind === 'regulation' ? 'regulations' : 'acts');
export const fedPageUrl = (kind: FedDocInfo['kind'] | LegisEntry['kind'], id: string) => `${FED_BASE}/eng/${folder(kind)}/${id}/index.html`;
const sectionUrl = (kind: FedDocInfo['kind'], id: string, num: string) => `${FED_BASE}/eng/${folder(kind)}/${id}/section-${num}.html`;
const word = (kind: FedDocInfo['kind']) => (kind === 'regulation' ? 'regulation' : 'act');

type Loaded = { id: string; doc: XNode; info: FedDocInfo; fetchedAt: string };
type Searchable = { info: FedDocInfo; records: SectionRecord[] };
export type Scored = { result: SearchResult; score: number };

export class FederalClient {
  private fetcher: Fetcher;
  private parsed = new Map<string, XNode>();
  private searchable = new Map<string, Searchable>();
  private legisCache: { key: string; entries: LegisEntry[] } | null = null;

  constructor(opts: { fetcher: Fetcher }) {
    this.fetcher = opts.fetcher;
  }

  // ---------- find_act ----------

  async findAct(name: string): Promise<ActCandidate[]> {
    const clean = name.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) throw new ToolError('name is empty.');
    const q = clean.toLowerCase();
    const words = q.split(' ').map((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
    const rank = (e: LegisEntry) => {
      const t = e.title.toLowerCase();
      return t === q ? 0 : t.includes(q) ? 1 : words.every((w) => w.test(t)) ? 2 : -1;
    };
    const found = (await this.legis())
      .map((e, order) => ({ e, r: rank(e), order }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || (a.e.kind === b.e.kind ? 0 : a.e.kind === 'act' ? -1 : 1) || a.e.title.length - b.e.title.length || a.order - b.order)
      .slice(0, 10);
    // The list's numbers are not the citations the official pages print (SPEC), so each candidate's page is read.
    const pages = await mapLimit(found, CONCURRENCY, ({ e }) => this.pageMeta(e.kind, e.id));
    return found.map(({ e }, i) => ({ act_id: e.id, title: e.title, citation: pages[i].citation ?? '', type: e.kind, source_url: fedPageUrl(e.kind, e.id) }));
  }

  // ---------- get_toc ----------

  async getToc(actId: string) {
    const { id, doc, info, fetchedAt } = await this.load(actId);
    const page = await this.pageMeta(info.kind, id);
    const pending = notInForce(doc);
    return {
      act: {
        jurisdiction: 'federal' as const,
        act_title: info.title ?? page.title ?? id,
        act_citation: page.citation ?? info.instrumentNumber ?? '',
        act_id: id,
        source_url: fedPageUrl(info.kind, id),
        current_to: page.currentTo,
        retrieved_at: fetchedAt,
      },
      outline: fedToc(doc),
      warnings: [...docWarnings(info, page), ...(info.allRepealed ? [`Every section of this ${word(info.kind)} reads "[Repealed…]": it is repealed.`] : [])],
      notes:
        pending.length > 0
          ? [`This ${word(info.kind)} lists ${pending.length} amendment${pending.length === 1 ? '' : 's'} not in force yet. They are not in this outline; the official page lists them under "Amendments not in force".`]
          : [],
      notice: FEDERAL_NOTICE,
    };
  }

  // ---------- get_section ----------

  async getSection(actId: string, section: string) {
    const num = normalizeSection(section);
    const { id, doc, info, fetchedAt } = await this.load(actId);
    const title = info.title ?? id;
    if (info.allRepealed) {
      throw new ToolError(`${title} (${id}) is repealed: every section of it reads "[Repealed…]". Find the current act with find_act (tool) or find (command).`);
    }
    const matches = findFedSections(bodySections(doc), num);
    const pending = notInForce(doc);
    const pendingFor = (n: string) => pending.filter((a) => a.sections.includes(n)).map((a) => a.citation);
    if (matches.length === 0) {
      const adds = pendingFor(num);
      if (adds.length > 0) {
        throw new ToolError(
          `Section ${num} of ${title} (${id}) is not in force: only an amendment that is not in force yet would add or change it (${adds.join('; ')}). The official page lists it under "Amendments not in force": ${fedPageUrl(info.kind, id)}`,
        );
      }
      throw new ToolError(`No section ${num} in ${title} (${id}). Its table of contents (get_toc tool, or toc command) lists the section numbers.`);
    }
    const page = await this.pageMeta(info.kind, id);
    const warnings = docWarnings(info, page);
    if (matches.length > 1) warnings.push(`${matches.length} provisions are numbered ${num} in this ${word(info.kind)} (for example one in a schedule). All are returned; check "location".`);
    for (const m of matches) {
      if (m.range) {
        warnings.push(
          `Sections ${m.num} ${m.repealed ? 'were repealed together' : 'are printed together'}. The official website has no page for section ${num} on its own, so source_url is the table of contents.`,
        );
      } else if (m.repealed) warnings.push(`Section ${m.num} is repealed.`);
      else if (m.stub) warnings.push(`Section ${m.num} holds only an editorial note, with no text of its own.`);
      if (m.schedule) {
        warnings.push(
          `Section ${m.num} here is an item of ${m.schedule}, not a section of the ${word(info.kind)} itself. The official website has no page for it on its own, so source_url is the table of contents.`,
        );
      }
      if (m.node.attrs['in-force'] === 'no') warnings.push(`Section ${m.num} is not in force yet (shaded on the official page).`);
      else if (hasNotInForcePart(m.node)) warnings.push(`Part of section ${m.num} is not in force yet: it is marked "[Not in force]" (shaded on the official page).`);
      const changes = pendingFor(m.num);
      if (changes.length > 0) {
        warnings.push(
          `An amendment that is not in force yet would change section ${m.num} (${changes.join('; ')}). The text returned is the text in force; the official page lists the amendment under "Amendments not in force".`,
        );
      }
    }
    const results = matches.map((m) => ({
      citation: {
        jurisdiction: 'federal',
        act_title: title,
        act_citation: page.citation ?? info.instrumentNumber ?? '',
        act_id: id,
        section: m.num,
        heading: m.heading,
        source_url: m.range || m.schedule ? fedPageUrl(info.kind, id) : sectionUrl(info.kind, id, m.num),
        current_to: page.currentTo,
        retrieved_at: fetchedAt,
      } satisfies Citation,
      location: m.location,
      text: renderFedSection(m.node),
    }));
    // Amendments that name no section (new headings, schedules, transitional provisions) can still bear on this one.
    const unnamed = pending.filter((a) => a.sections.length === 0).length;
    const notes =
      unnamed > 0
        ? [
            `${unnamed} amendment${unnamed === 1 ? '' : 's'} not in force yet ${unnamed === 1 ? 'names' : 'name'} no particular section (for example a new heading, a schedule or a transitional provision). The official page lists ${unnamed === 1 ? 'it' : 'them'} under "Amendments not in force".`,
          ]
        : null;
    const [first, ...others] = results;
    return { ...first, ...(others.length > 0 ? { other_matches: others } : {}), warnings, ...(notes ? { notes } : {}), notice: FEDERAL_NOTICE };
  }

  // ---------- search_law ----------

  async search(query: string, limit = 10) {
    return (await this.searchScored(query, limit)).output;
  }

  /** search() plus each result's score, so that search_law "all" can rank BC and federal results together. */
  async searchScored(query: string, limit = 10) {
    const { phrases, and } = parsePhrases(query);
    if (phrases.length === 0) throw new ToolError('query is empty.');
    const wordless = phrases.find((p) => !/[\p{L}\p{N}]/u.test(p));
    if (wordless) {
      throw new ToolError(`"${wordless}" is not a search phrase. Give words, e.g. "general holiday" OR "general holidays", or a word ending in * such as break*.`);
    }
    const alternatives = phrases.map(phrasePattern).join('|');
    const hitsIn = (s: string) => (s.match(new RegExp(alternatives, 'gi')) ?? []).length;
    const has = (s: string | null) => s !== null && new RegExp(alternatives, 'i').test(s);
    const whole = new RegExp(`^(?:${alternatives})$`, 'i');
    const mark = (s: string) => s.replace(new RegExp(alternatives, 'gi'), (m) => `**${m}**`);

    const warnings: string[] = [];
    const scope = await this.searchScope(warnings);
    let searched = 0;
    type Hit = { entry: (typeof scope)[number]; r: SectionRecord; info: FedDocInfo; fetchedAt: string; score: number; match: string[]; order: number };
    const perDoc = await mapLimit(scope, CONCURRENCY, async (entry, docIndex): Promise<Hit[]> => {
      const res = await this.fetcher(xmlUrl(entry.id));
      if (res.status !== 200) {
        warnings.push(`${entry.title} (${entry.id}) could not be read (HTTP ${res.status}), so it was not searched.`);
        return [];
      }
      const { info, records } = this.toSearchable(res);
      if (info.kind === 'unknown') {
        warnings.push(`${entry.title} (${entry.id}) did not come back as legislation XML, so it was not searched.`);
        return [];
      }
      if (entry.id === SEARCHED_ACT && records.length === 0) warnings.push(`${entry.title} (${entry.id}) came back with no sections, so nothing in it could be searched.`);
      searched++;
      return records.flatMap((r, secIndex) => {
        const hits = hitsIn(r.text) + hitsIn(r.notes);
        const above = has(r.nearestHeading);
        if (hits === 0 && !above) return [];
        const exact = r.definedTerms.some((t) => whole.test(t));
        const partial = !exact && r.definedTerms.some((t) => has(t));
        const heading = has(r.heading);
        const headingFirst = heading && new RegExp(`^(?:${alternatives})`, 'i').test(r.heading ?? '');
        const score =
          (exact ? 100 : partial ? 20 : 0) + (heading ? 50 : 0) + (headingFirst ? 10 : 0) + (above ? 30 : 0) + Math.min(hits, 10) + (entry.kind === 'act' ? 15 : 0);
        const match = [
          ...(exact ? ['defines the term'] : partial ? ['inside a defined term'] : []),
          ...(heading ? ['heading'] : []),
          ...(above ? ['heading above the section'] : []),
          `${hits} hit${hits === 1 ? '' : 's'}`,
          ...(r.schedule ? ['in a schedule'] : []),
          ...(r.notInForce === 'whole' ? ['not in force yet'] : r.notInForce === 'part' ? ['partly not in force yet'] : []),
        ];
        return [{ entry, r, info, fetchedAt: res.fetchedAt, score, match, order: docIndex * 100_000 + secIndex }];
      });
    });
    const top = perDoc
      .flat()
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, limit);

    const pages = new Map<string, FedPageMeta>();
    await mapLimit([...new Set(top.map((h) => h.entry.id))], CONCURRENCY, async (id) => {
      const h = top.find((x) => x.entry.id === id)!;
      pages.set(id, await this.pageMeta(h.info.kind, id));
    });
    const undated = [...pages].filter(([, p]) => !p.currentTo).map(([id]) => id);
    if (undated.length > 0) warnings.push(`${CURRENT_TO_WARNING} (${undated.join(', ')})`);

    const scored: Scored[] = top.map(({ entry, r, info, fetchedAt, score, match }) => {
      const page = pages.get(entry.id)!;
      const body = r.text.split('\n').map(mark).join(' ').replace(/\s+/g, ' ');
      const lead = has(r.heading) ? mark(r.heading!) : has(r.nearestHeading) ? mark(r.nearestHeading!) : null;
      const snippet = cutSnippet(body, () => `${lead ? `[${lead}] ` : ''}${body.length > 240 ? body.slice(0, 240) + '…' : body}`);
      return {
        score,
        result: {
          jurisdiction: 'federal',
          act_title: info.title ?? entry.title,
          act_citation: page.citation ?? info.instrumentNumber ?? '',
          act_id: entry.id,
          section: r.num,
          heading: r.heading,
          // a schedule item has no page of its own: its number is not a section number of the act
          source_url: r.schedule ? fedPageUrl(info.kind, entry.id) : sectionUrl(info.kind, entry.id, r.num),
          current_to: page.currentTo,
          retrieved_at: fetchedAt,
          snippet,
          match,
          ...(r.schedule ? { schedule: r.schedule } : {}),
        },
      };
    });
    for (const { entry, r } of top) {
      if (r.notInForce) {
        warnings.push(
          `${r.notInForce === 'whole' ? `Section ${r.num}` : `Part of section ${r.num}`} of ${entry.title} (${entry.id}) is not in force yet (marked "[Not in force]"); read it with get_section before relying on it.`,
        );
      }
    }

    const regs = scope.length - 1;
    const asked = phrases.map((p) => `"${p}"`).join(' OR ');
    if (scored.length === 0) {
      warnings.push(
        `No section of the ${searched} document${searched === 1 ? '' : 's'} searched matched ${asked}. Matching is literal, so this does not show that the law has no such rule: try other wording, singular and plural, or map_term.`,
      );
    }
    return {
      output: {
        query: asked,
        documents_searched: searched,
        results: scored.map((s) => s.result),
        warnings,
        notes: [
          `Federal search covers the Canada Labour Code and the ${regs} regulation${regs === 1 ? '' : 's'} made under it, from the official list of acts and regulations. Other federal acts and regulations, and amendments not in force yet, are not searched: find an act with find_act, then read it with get_toc and get_section.`,
          ...(and ? ['Federal search has no AND: the words joined by AND were searched as alternatives, as if joined by OR.'] : []),
          LITERAL_NOTE,
          SNIPPET_NOTE,
        ],
        notice: FEDERAL_NOTICE,
      },
      scored,
    };
  }

  /** The Canada Labour Code and, from the official list, the regulations made under it. */
  private async searchScope(warnings: string[]): Promise<{ id: string; title: string; kind: LegisEntry['kind'] }[]> {
    const code = { id: SEARCHED_ACT, title: 'Canada Labour Code', kind: 'act' as const };
    let list: LegisEntry[];
    try {
      list = await this.legis();
    } catch (e) {
      if (!(e instanceof ToolError)) throw e;
      warnings.push(`The official list of acts and regulations could not be read, so only the Canada Labour Code itself was searched, not its regulations. (${e.message})`);
      return [code];
    }
    const act = list.find((e) => e.id === SEARCHED_ACT)!; // legis() makes sure it is there
    if (act.regRefs.length === 0) warnings.push('The official list names no regulations under the Canada Labour Code, so only the Code itself was searched.');
    const regs = act.regRefs.map((ref) => list.find((e) => e.ref === ref));
    const missing = regs.filter((e) => !e).length;
    if (missing > 0) {
      warnings.push(
        `${missing} regulation${missing === 1 ? '' : 's'} the official list puts under the Canada Labour Code ${missing === 1 ? 'is' : 'are'} not in the list itself, so ${missing === 1 ? 'it was' : 'they were'} not searched.`,
      );
    }
    return [{ ...code, title: act.title }, ...regs.flatMap((e) => (e ? [{ id: e.id, title: e.title, kind: e.kind }] : []))];
  }

  private toSearchable(res: FetchResult): Searchable {
    const key = `${res.url}@${res.fetchedAt}`;
    let s = this.searchable.get(key);
    if (!s) {
      const doc = parseXml(res.body);
      s = { info: fedDocInfo(doc), records: sectionRecords(doc) };
      this.searchable.set(key, s);
      if (this.searchable.size > 80) this.searchable.delete(this.searchable.keys().next().value as string);
    }
    return s;
  }

  // ---------- internals ----------

  protected async load(actId: string): Promise<Loaded> {
    const id = normalizeFedId(actId);
    const res = await this.fetcher(xmlUrl(id));
    if (res.status === 404) throw new ToolError(`No federal act or regulation with act_id "${id}". Look up the id with find_act (tool) or find (command).`);
    if (res.status !== 200) throw new ToolError(`Justice Laws returned HTTP ${res.status} for ${id}.`);
    const doc = this.parse(res);
    const info = fedDocInfo(doc);
    if (info.kind === 'unknown') throw new ToolError(`${id} is not an act or regulation in XML form. Look up the act id with find_act (tool) or find (command).`);
    return { id, doc, info, fetchedAt: res.fetchedAt };
  }

  protected parse(res: FetchResult): XNode {
    const key = `${res.url}@${res.fetchedAt}`;
    let doc = this.parsed.get(key);
    if (!doc) {
      doc = parseXml(res.body);
      this.parsed.set(key, doc);
      if (this.parsed.size > 6) this.parsed.delete(this.parsed.keys().next().value as string);
    }
    return doc;
  }

  protected async pageMeta(kind: FedDocInfo['kind'] | LegisEntry['kind'], id: string): Promise<FedPageMeta> {
    const res = await this.fetcher(fedPageUrl(kind, id));
    return res.status === 200 ? parseFedPage(res.body) : { title: null, citation: null, currentTo: null, lastAmended: null };
  }

  /** The English entries of the official list of acts and regulations. */
  protected async legis(): Promise<LegisEntry[]> {
    const res = await this.fetcher(LEGIS_URL);
    if (res.status !== 200) {
      throw new ToolError(`The official list of federal acts and regulations could not be read (HTTP ${res.status}). Try again later, or pass a known act_id (such as L-2) to get_toc.`);
    }
    const key = `${res.url}@${res.fetchedAt}`;
    if (this.legisCache?.key !== key) {
      // A 200 that is not the list (an error page, a new format) must not pass for an empty list.
      const entries = parseLegis(res.body);
      if (!entries.some((e) => e.id === SEARCHED_ACT)) {
        throw new ToolError(
          `The official list of federal acts and regulations could not be read: it came back without ${entries.length === 0 ? 'any English entries' : 'the Canada Labour Code (L-2)'}, so its format may have changed. Try again later, or pass a known act_id (such as L-2) to get_toc.`,
        );
      }
      this.legisCache = { key, entries };
    }
    return this.legisCache.entries;
  }
}

/** current_to missing, the page and the XML being different versions, and the act's official note. */
function docWarnings(info: FedDocInfo, page: FedPageMeta): string[] {
  const w: string[] = [];
  if (!page.currentTo) w.push(CURRENT_TO_WARNING);
  if (page.lastAmended && info.lastAmended && page.lastAmended !== info.lastAmended) {
    w.push(
      `The official page says this ${word(info.kind)} was last amended on ${page.lastAmended}, but the XML text is the version last amended on ${info.lastAmended}, so it may not be the current text. Check source_url.`,
    );
  }
  if (info.readerNote) w.push(`Official note on this ${word(info.kind)}: ${info.readerNote}`);
  return w;
}

/**
 * '"general holiday" OR "general holidays"' → ['general holiday', 'general holidays']. Quoted phrases are taken whole,
 * with or without OR between them (models write both); the words outside quotes are split at OR / AND in any case.
 * Federal search has no AND, so AND is searched as OR, and `and` says so.
 */
export function parsePhrases(query: string): { phrases: string[]; and: boolean } {
  const quoted = [...query.matchAll(/"([^"]*)"/g)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter(Boolean);
  const rest = query.replace(/"[^"]*"/g, ' ').replace(/["()]/g, ' ');
  const loose = rest
    .split(/\b(?:OR|AND)\b/i)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return { phrases: [...quoted, ...loose], and: /\bAND\b/i.test(rest) };
}

/** A phrase as a regex source: whole words, any spacing between them, ' and ’ alike, and a trailing * for any ending. */
function phrasePattern(phrase: string): string {
  const words = phrase.split(/\s+/).map((w) => {
    const star = w.endsWith('*');
    const core = (star ? w.slice(0, -1) : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['\u2019]/g, "['\u2019]");
    return star ? `${core}\\w*` : core;
  });
  return `(?<![\\w])${words.join('\\s+')}(?![\\w])`;
}
