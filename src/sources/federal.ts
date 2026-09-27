// Justice Laws client (acts and regulations of Canada): find acts, read tables of contents and sections.
// The website's behaviour, including what its documentation leaves out, is recorded in SPEC.md ("联邦（Justice Laws）").
import type { FetchResult, Fetcher } from '../http.js';
import { FEDERAL_NOTICE } from '../notice.js';
import { ToolError } from '../tool-error.js';
import type { ActCandidate, Citation } from '../types.js';
import { CURRENT_TO_WARNING, mapLimit, normalizeSection } from './bc.js';
import { FED_BASE, normalizeFedId, parseFedPage, parseLegis, type FedPageMeta, type LegisEntry } from './federal-meta.js';
import { bodySections, fedDocInfo, fedToc, findFedSections, hasNotInForcePart, notInForce, renderFedSection, type FedDocInfo } from './federal-xml.js';
import { parseXml, type XNode } from './xml.js';

const CONCURRENCY = 4;
const LEGIS_URL = `${FED_BASE}/eng/XML/Legis.xml`;
const xmlUrl = (id: string) => `${FED_BASE}/eng/XML/${id}.xml`;
const folder = (kind: FedDocInfo['kind'] | LegisEntry['kind']) => (kind === 'regulation' ? 'regulations' : 'acts');
export const fedPageUrl = (kind: FedDocInfo['kind'] | LegisEntry['kind'], id: string) => `${FED_BASE}/eng/${folder(kind)}/${id}/index.html`;
const sectionUrl = (kind: FedDocInfo['kind'], id: string, num: string) => `${FED_BASE}/eng/${folder(kind)}/${id}/section-${num}.html`;
const word = (kind: FedDocInfo['kind']) => (kind === 'regulation' ? 'regulation' : 'act');

type Loaded = { id: string; doc: XNode; info: FedDocInfo; fetchedAt: string };

export class FederalClient {
  private fetcher: Fetcher;
  private parsed = new Map<string, XNode>();
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
      if (m.range) warnings.push(`Sections ${m.num} were repealed together. The official website has no page for section ${num} on its own, so source_url is the table of contents.`);
      else if (m.repealed) warnings.push(`Section ${m.num} is repealed.`);
      if (hasNotInForcePart(m.node)) warnings.push(`Part of section ${m.num} is not in force yet: it is marked "[Not in force]" (shaded on the official page).`);
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
        source_url: m.range ? fedPageUrl(info.kind, id) : sectionUrl(info.kind, id, m.num),
        current_to: page.currentTo,
        retrieved_at: fetchedAt,
      } satisfies Citation,
      location: m.location,
      text: renderFedSection(m.node),
    }));
    const [first, ...others] = results;
    return { ...first, ...(others.length > 0 ? { other_matches: others } : {}), warnings, notice: FEDERAL_NOTICE };
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
    if (this.legisCache?.key !== key) this.legisCache = { key, entries: parseLegis(res.body) };
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
