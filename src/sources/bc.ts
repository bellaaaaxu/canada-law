// BC Laws CiviX client: find acts, read tables of contents and sections, and search down to sections.
// Behaviour of the API that the official docs get wrong or leave out is recorded in SPEC.md ("BC Laws").
import type { FetchResult, Fetcher } from '../http.js';
import { ToolError } from '../tool-error.js';
import type { ActCandidate, Citation, SearchResult } from '../types.js';
import { BC_LAWS_NOTICE } from '../notice.js';
import { classifyDoc, parseFullSearch, parsePageMeta, type PageMeta } from './bc-meta.js';
import {
  analyzeHitSections,
  buildToc,
  docInfo,
  findElement,
  findSections,
  parseXml,
  renderSection,
  renderToc,
  type DocInfo,
  type SectionHits,
  type XNode,
} from './bc-xml.js';

export { ToolError };

const BASE = 'https://www.bclaws.gov.bc.ca/civix';
const DOC = `${BASE}/document/id/complete/statreg/`;
const MAX_PAGE = 20; // CiviX answers HTTP 500 when e − s > 20, although its docs say 100
const MAX_DOCS_SEARCHED = 8;
const CONCURRENCY = 4;
const SECTIONS_XPATH = '/xpath///bcl:section%5Bdescendant::hit%5D';

export const CURRENT_TO_WARNING =
  'current_to is null: the official page did not show a "current to" date, so currency could not be confirmed. Check source_url before relying on this text.';

export const pageUrl = (id: string) => DOC + id.replace(/_multi$/, '');

export class BcClient {
  private fetcher: Fetcher;
  private parsed = new Map<string, XNode>();

  constructor(opts: { fetcher: Fetcher }) {
    this.fetcher = opts.fetcher;
  }

  // ---------- find_act ----------

  async findAct(name: string): Promise<ActCandidate[]> {
    const clean = name.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) throw new ToolError('name is empty.');
    let { docs } = await this.fullSearch(`title:"${clean}"`);
    if (docs.length === 0) {
      const words = clean.split(' ').map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
      if (words.length > 0) ({ docs } = await this.fullSearch(`title:(${words.map((w) => '+' + w).join(' ')})`));
    }

    const byKey = new Map<string, ActCandidate & { order: number }>();
    docs.forEach((d, order) => {
      const c = classifyDoc(d);
      if (c.kind === 'other') return;
      const key = `${c.kind}|${c.actTitle}|${c.actCitation}`;
      if (byKey.has(key)) return;
      byKey.set(key, { act_id: c.actId, title: c.actTitle, citation: c.actCitation, type: c.kind, source_url: pageUrl(c.actId), order });
    });

    const exact = (a: ActCandidate) => (a.title.toLowerCase() === clean.toLowerCase() ? 0 : 1);
    const typeRank = (a: ActCandidate) => (a.type === 'act' ? 0 : 1);
    const statusRank = (a: ActCandidate) => (a.status === 'repealed or replaced' ? 1 : 0);
    const list = [...byKey.values()].sort((a, b) => exact(a) - exact(b) || typeRank(a) - typeRank(b) || a.order - b.order);

    // Repealed/replaced acts are stubs whose root carries @status; <act:repealedtext> alone proves nothing
    // (the current Workers Compensation Act uses it for a CPI note).
    await mapLimit(
      list.filter((a) => a.type === 'act').slice(0, 5),
      CONCURRENCY,
      async (a) => {
        const res = await this.fetcher(`${DOC}${a.act_id}/xml/xpath//act:act%5B@status%5D`);
        const stub = res.status === 200 ? findElement(parseXml(res.body), 'act:act') : null;
        if (res.status === 200 && !stub && /No Results/.test(res.body)) {
          a.status = 'current';
        } else if (stub) {
          const info = docInfo({ name: '#document', attrs: {}, children: [stub] });
          a.status = NOT_CURRENT.test(info.status ?? '') ? 'repealed or replaced' : 'unknown';
          a.note = [`status: ${info.status}`, info.repealedText].filter(Boolean).join('. ');
        } else a.status = 'unknown';
      },
    );

    return list
      .sort((a, b) => exact(a) - exact(b) || statusRank(a) - statusRank(b) || typeRank(a) - typeRank(b) || a.order - b.order)
      .slice(0, 10)
      .map(({ order: _order, ...a }) => a);
  }

  // ---------- get_toc ----------

  async getToc(actId: string) {
    const { id, doc, fetchedAt } = await this.loadDoc(actId);
    const facts = await this.actFacts(id, doc);
    const warnings: string[] = [];
    if (!facts.page.currentTo) warnings.push(CURRENT_TO_WARNING);
    warnings.push(...statusWarnings(facts.info));
    return {
      act: {
        jurisdiction: 'bc' as const,
        act_title: facts.title,
        act_citation: facts.citation,
        act_id: id,
        source_url: pageUrl(id),
        current_to: facts.page.currentTo,
        retrieved_at: fetchedAt,
      },
      outline: renderToc(buildToc(doc)),
      warnings,
      notice: BC_LAWS_NOTICE,
    };
  }

  // ---------- get_section ----------

  async getSection(actId: string, section: string) {
    const num = normalizeSection(section);
    const { id, doc, fetchedAt } = await this.loadDoc(actId);
    const facts = await this.actFacts(id, doc);
    if (NOT_CURRENT.test(facts.info.status ?? '')) {
      throw new ToolError(
        `${facts.title} (${id}) is not a current consolidation (status: ${facts.info.status}). ${facts.info.repealedText ?? ''} Find the current act with find_act (tool) or find (command).`,
      );
    }
    const matches = findSections(doc, num);
    if (matches.length === 0) {
      throw new ToolError(`No section ${num} in ${facts.title} (${id}). Its table of contents (get_toc tool, or toc command) lists the section numbers.`);
    }
    const warnings: string[] = [];
    if (!facts.page.currentTo) warnings.push(CURRENT_TO_WARNING);
    warnings.push(...statusWarnings(facts.info));
    if (matches.length > 1) {
      warnings.push(`${matches.length} provisions are numbered ${num} in this act (for example one in a Schedule). All are returned; check "location".`);
    }
    const results = matches.map((m) => ({
      citation: {
        jurisdiction: 'bc',
        act_title: facts.title,
        act_citation: facts.citation,
        act_id: id,
        section: m.num,
        heading: m.heading,
        source_url: `${pageUrl(m.partDocId ?? id)}#section${m.num}`,
        current_to: facts.page.currentTo,
        retrieved_at: fetchedAt,
      } satisfies Citation,
      location: m.location,
      text: renderSection(m.node),
    }));
    const [first, ...others] = results;
    return { ...first, ...(others.length > 0 ? { other_matches: others } : {}), warnings, notice: BC_LAWS_NOTICE };
  }

  // ---------- search_law ----------

  async search(query: string, limit = 10) {
    const q = query.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) throw new ToolError('query is empty.');
    const wrapped = `(${q})`; // without parentheses CiviX turns the first word of "a b" into an optional term
    const { totalHits, docs } = await this.fullSearch(wrapped);

    const seen = new Set<string>();
    const candidates = docs
      .map(classifyDoc)
      .filter((c) => c.kind !== 'other')
      .filter((c) => (seen.has(c.docId) ? false : (seen.add(c.docId), true)))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'act' ? -1 : 1))
      .slice(0, MAX_DOCS_SEARCHED);

    const warnings: string[] = [];
    type Hit = { c: (typeof candidates)[number]; s: SectionHits; docIndex: number; secIndex: number; fetchedAt: string };
    const perDoc = await mapLimit(candidates, CONCURRENCY, async (c, docIndex): Promise<Hit[]> => {
      const res = await this.fetcher(`${DOC}${c.docId}/xml/search/${encodeURIComponent(wrapped)}${SECTIONS_XPATH}`);
      if (res.status !== 200) {
        warnings.push(
          `In-document search failed for ${c.actTitle} (${c.docId}): HTTP ${res.status}. BC Laws also answers 500 when the words are not in the text itself (e.g. only in the title), so this document was skipped.`,
        );
        return [];
      }
      return analyzeHitSections(parseXml(res.body)).map((s, secIndex) => ({ c, s, docIndex, secIndex, fetchedAt: res.fetchedAt }));
    });

    const score = ({ c, s }: Hit) =>
      (s.definedTermExact ? 100 : s.definedTermPartial ? 20 : 0) +
      (s.headingHit ? 50 : 0) +
      (s.headingStartsWithHit ? 10 : 0) +
      Math.min(s.totalHits, 10) +
      (c.kind === 'act' ? 15 : 0);
    const top = perDoc
      .flat()
      .sort((a, b) => score(b) - score(a) || a.docIndex - b.docIndex || a.secIndex - b.secIndex)
      .slice(0, limit);

    const metas = new Map<string, PageMeta>();
    await mapLimit([...new Set(top.map((h) => h.c.actId))], CONCURRENCY, async (id) => {
      metas.set(id, await this.pageMeta(id));
    });
    const undated = [...metas].filter(([, m]) => !m.currentTo).map(([id]) => id);
    if (undated.length > 0) warnings.push(`${CURRENT_TO_WARNING} (${undated.join(', ')})`);

    const results: SearchResult[] = top.map(({ c, s, fetchedAt }) => ({
      jurisdiction: 'bc',
      act_title: c.actTitle,
      act_citation: c.actCitation,
      act_id: c.actId,
      section: s.num,
      heading: s.heading,
      source_url: `${pageUrl(c.docId)}#section${s.num}`,
      current_to: metas.get(c.actId)?.currentTo ?? null,
      retrieved_at: fetchedAt,
      snippet: s.snippet,
      match: [
        ...(s.definedTermExact ? ['defines the term'] : s.definedTermPartial ? ['inside a defined term'] : []),
        ...(s.headingHit ? ['heading'] : []),
        `${s.totalHits} hit${s.totalHits === 1 ? '' : 's'}`,
      ],
    }));

    return {
      query: q,
      documents_matched: totalHits,
      documents_searched: candidates.length,
      results,
      warnings,
      notes: [
        `BC Laws full-site search returns documents, not sections: the top ${MAX_PAGE} documents by its own ranking were taken, point-in-time versions and legislative-change tables were dropped, and up to ${MAX_DOCS_SEARCHED} current acts/regulations were searched section by section.`,
        'Matching is literal (no plurals or stemming): include variants, e.g. "meal break" OR "meal breaks", or a wildcard such as break*.',
        'A snippet is the whole section when the section is short; otherwise it is cut short to the clause around the first match (… marks a cut), and other parts of the section can change its meaning. Before quoting, explaining or citing a section, read its full text with get_section (MCP tool) or the section command.',
      ],
      notice: BC_LAWS_NOTICE,
    };
  }

  // ---------- internals ----------

  private async fullSearch(q: string) {
    const res = await this.fetcher(`${BASE}/search/complete/fullsearch?q=${encodeURIComponent(q)}&s=0&e=${MAX_PAGE}`);
    if (res.status !== 200) {
      throw new ToolError(
        `BC Laws search failed (HTTP ${res.status}) for ${q}. Use plain words or "double-quoted phrases" joined by OR, with balanced quotes and parentheses.`,
      );
    }
    return parseFullSearch(res.body);
  }

  /** Loads an act/regulation XML. A multi-document act's table-of-contents id is followed to its "_multi" document. */
  private async loadDoc(actId: string): Promise<{ id: string; doc: XNode; fetchedAt: string }> {
    if (!/^[A-Za-z0-9_]+$/.test(actId)) throw new ToolError(`act_id "${actId}" is not a BC Laws document id. Look it up with find_act (tool) or find (command).`);
    let id = actId;
    let res = await this.fetchDoc(id);
    if (/<html[^>]*data-ismulti="true"/.test(res.body.slice(0, 3000)) && !id.endsWith('_multi')) {
      id = `${id}_multi`;
      res = await this.fetchDoc(id);
    }
    const doc = this.parse(res);
    if (docInfo(doc).kind === 'unknown') {
      throw new ToolError(`Document ${actId} is not an act or regulation in XML form. Look up the act id with find_act (tool) or find (command).`);
    }
    return { id, doc, fetchedAt: res.fetchedAt };
  }

  private async fetchDoc(id: string): Promise<FetchResult> {
    const res = await this.fetcher(`${DOC}${id}/xml`);
    if (res.status === 404) throw new ToolError(`No BC Laws document with act_id "${id}". Look up the id with find_act (tool) or find (command).`);
    if (res.status !== 200) throw new ToolError(`BC Laws returned HTTP ${res.status} for document ${id}.`);
    return res;
  }

  private parse(res: FetchResult): XNode {
    const key = `${res.url}@${res.fetchedAt}`;
    let doc = this.parsed.get(key);
    if (!doc) {
      doc = parseXml(res.body);
      this.parsed.set(key, doc);
      if (this.parsed.size > 6) this.parsed.delete(this.parsed.keys().next().value as string);
    }
    return doc;
  }

  private async pageMeta(id: string): Promise<PageMeta> {
    const res = await this.fetcher(pageUrl(id));
    return res.status === 200 ? parsePageMeta(res.body) : { title: null, citation: null, currentTo: null };
  }

  private async actFacts(id: string, doc: XNode) {
    const info = docInfo(doc);
    const page = await this.pageMeta(id);
    const title = info.title ?? page.title ?? id;
    const citation = info.kind === 'regulation' ? (info.regnum ? `B.C. Reg. ${info.regnum}` : '') : (page.citation ?? '');
    return { info, page, title, citation };
  }
}

const NOT_CURRENT = /^(repealed|replaced)$/i;

/** Repeal status, unrecognised @status values and official notes are surfaced, never dropped. */
function statusWarnings(info: DocInfo): string[] {
  if (info.status && NOT_CURRENT.test(info.status)) {
    return [`Not a current consolidation (status: ${info.status}). ${info.repealedText ?? ''}`.trim()];
  }
  if (info.status) return [`The document carries an unrecognised status "${info.status}"; check source_url before relying on it.`];
  if (info.repealedText) return [`Official note on this act: ${info.repealedText}`];
  return [];
}

/** Accepts "40", "52.13", "128-129", also "s.40" / "section 40"; rejects anything that could break the request. */
export function normalizeSection(section: string): string {
  const s = section.trim().replace(/^(?:ss?\.|section)\s*/i, '');
  if (!/^\d+[A-Za-z]?(?:\.\d+[A-Za-z]?)*(?:-\d+[A-Za-z]?(?:\.\d+[A-Za-z]?)*)?$/.test(s)) {
    throw new ToolError(`"${section}" is not a section number (expected something like 40, 52.13 or 128-129).`);
  }
  return s;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
