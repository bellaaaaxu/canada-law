import { describe, expect, it } from 'vitest';
import { BC_LAWS_NOTICE } from '../src/notice.js';
import { BcClient, ToolError } from '../src/sources/bc.js';
import { DOC, FETCHED_AT, NO_RESULTS, esaRoutes, fakeFetcher, fx, type Route } from './helpers.js';

describe('BC Laws licence notice (King\'s Printer Licence §3.3)', () => {
  it('is the statement the licence prescribes, word for word', () => {
    expect(BC_LAWS_NOTICE).toBe(
      "These materials contain information that has been derived from information originally made available by the Province of British Columbia at: http://www.bclaws.gov.bc.ca and this information is being used in accordance with the King's Printer Licence – British Columbia available at: https://www.bclaws.gov.bc.ca/standards/Licence.html. They have not, however, been produced in affiliation with, or with the endorsement of, the Province of British Columbia and THESE MATERIALS ARE NOT AN OFFICIAL VERSION.",
    );
  });
});


describe('BcClient.getSection', () => {
  it('returns s.40 with the full citation contract', async () => {
    const client = new BcClient({ fetcher: fakeFetcher(esaRoutes) });
    const r = await client.getSection('96113_01', '40');
    expect(r.citation).toEqual({
      jurisdiction: 'bc',
      act_title: 'Employment Standards Act',
      act_citation: 'RSBC 1996, c. 113',
      act_id: '96113_01',
      section: '40',
      heading: 'Overtime wages for employees not working under an averaging agreement',
      source_url: `${DOC}96113_01#section40`,
      current_to: '2026-09-15',
      retrieved_at: FETCHED_AT,
    });
    expect(r.location).toEqual(['Part 4 — Hours of Work and Overtime']);
    expect(r.text.startsWith('40 (1) An employer must pay an employee who works over 8 hours a day')).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.notice).toBe(BC_LAWS_NOTICE);
  });

  it('says clearly when a section does not exist, and points to get_toc', async () => {
    const client = new BcClient({ fetcher: fakeFetcher(esaRoutes) });
    await expect(client.getSection('96113_01', '999')).rejects.toThrow(/No section 999 .*get_toc/);
  });

  it('rejects a malformed section number before calling BC Laws', async () => {
    const fetcher = fakeFetcher(esaRoutes);
    const client = new BcClient({ fetcher });
    await expect(client.getSection('96113_01', "40'] | //x")).rejects.toBeInstanceOf(ToolError);
    expect(fetcher.calls).toHaveLength(0);
  });

  it('returns current_to null with a warning when the official page shows no date', async () => {
    const routes: Route[] = [[(u) => u === `${DOC}96113_01`, '<html><div id="title"><h2>Employment Standards Act</h2></div></html>'], ...esaRoutes];
    const r = await new BcClient({ fetcher: fakeFetcher(routes) }).getSection('96113_01', '40');
    expect(r.citation.current_to).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/current_to/);
  });

  it('treats an official note in act:repealedtext on a current act as a warning, not as a repeal', async () => {
    // The current Workers Compensation Act carries its CPI note in <act:repealedtext> (seen live 2026-09-24).
    const note =
      '<act:repealedtext><in:em>[Note: the dollar amounts shown in sections 94, 95 may not reflect the current consumer price index adjustments referred to in section 333.]</in:em></act:repealedtext>';
    const withNote = fx('doc-96113_01.xml').replace('<act:yearenacted>1996</act:yearenacted>', `<act:yearenacted>1996</act:yearenacted>${note}`);
    const routes: Route[] = [[(u) => u === `${DOC}96113_01/xml`, withNote], ...esaRoutes];
    const r = await new BcClient({ fetcher: fakeFetcher(routes) }).getSection('96113_01', '40');
    expect(r.citation.heading).toBe('Overtime wages for employees not working under an averaging agreement');
    expect(r.warnings.join(' ')).toContain('Note: the dollar amounts shown in sections 94, 95');
  });

  it('refuses a repealed act and quotes the official reason', async () => {
    const stub =
      '<?xml version="1.0" encoding="UTF-8"?><act:act xmlns:act="http://www.gov.bc.ca/2013/legislation/act" xmlns:in="http://www.qp.gov.bc.ca/2013/inline" id="00_96191REP_01" status="Repealed"><act:title>Holiday Shopping Regulation Act</act:title><act:chapter>191</act:chapter><act:yearenacted>1996</act:yearenacted><act:repealedtext>[Repealed by the <in:doc>Miscellaneous Statutes Amendment Act, 2003</in:doc>, SBC2003, c. 7, s. 26, effective December 5, 2003 (B.C. Reg. 453/2003).]</act:repealedtext></act:act>';
    const client = new BcClient({ fetcher: fakeFetcher([[(u) => u === `${DOC}96191rep_01/xml`, stub]]) });
    await expect(client.getSection('96191rep_01', '1')).rejects.toThrow(
      /Repealed.*Repealed by the Miscellaneous Statutes Amendment Act, 2003, SBC2003, c\. 7/,
    );
  });

  it('follows a multi-document act from its table-of-contents id and links to the right part page', async () => {
    const fetcher = fakeFetcher([
      [(u) => u === `${DOC}02057_00/xml`, '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" data-ismulti="true" id="02057_00"></html>'],
      [(u) => u === `${DOC}02057_00_multi/xml`, fx('doc-02057_00_multi-trimmed.xml')],
      [(u) => u === `${DOC}02057_00`, fx('page-02057_00.head.html')],
    ]);
    const r = await new BcClient({ fetcher }).getSection('02057_00', '10');
    expect(r.citation).toMatchObject({
      act_id: '02057_00_multi',
      act_title: 'Business Corporations Act',
      act_citation: 'SBC 2002, c. 57',
      heading: 'Formation of company',
      source_url: `${DOC}02057_02#section10`,
      current_to: '2026-09-15',
    });
  });
});

describe('BcClient.getToc', () => {
  it('returns the outline with act-level citation facts', async () => {
    const r = await new BcClient({ fetcher: fakeFetcher(esaRoutes) }).getToc('96113_01');
    expect(r.act).toMatchObject({ act_title: 'Employment Standards Act', act_citation: 'RSBC 1996, c. 113', current_to: '2026-09-15', source_url: `${DOC}96113_01` });
    expect(r.outline).toContain('Part 4 — Hours of Work and Overtime\n  31  Repealed\n  32  Meal breaks');
    expect(r.notice).toBe(BC_LAWS_NOTICE);
  });
});

describe('BcClient.findAct', () => {
  const titleRoute = (needle: string, file: string): Route => [
    (u) => u.includes('/search/complete/fullsearch?') && u.toLowerCase().includes(`title:"${needle}"`),
    fx(file),
  ];

  it('lists the act first, then its regulation, and drops TLC / historical / point-in-time documents', async () => {
    const client = new BcClient({ fetcher: fakeFetcher([titleRoute('employment standards', 'fullsearch-title-employment-standards.xml'), ...esaRoutes]) });
    const r = await client.findAct('Employment Standards');
    expect(r[0]).toMatchObject({ act_id: '96113_01', title: 'Employment Standards Act', citation: 'RSBC 1996, c. 113', type: 'act', source_url: `${DOC}96113_01` });
    expect(r.map((a) => a.act_id)).toContain('396_95');
    expect(r.find((a) => a.act_id === '396_95')).toMatchObject({ title: 'Employment Standards Regulation', citation: 'B.C. Reg. 396/95', type: 'regulation' });
    expect(r.map((a) => a.act_id).filter((id) => /tlc|pit|^ht/.test(id))).toEqual([]);
  });

  it('merges the parts of a multi-document act into one entry', async () => {
    const client = new BcClient({ fetcher: fakeFetcher([titleRoute('business corporations act', 'fullsearch-title-business-corporations.xml'), [(u) => u.includes('/xpath//act:act[@status]'), NO_RESULTS]]) });
    const r = await client.findAct('Business Corporations Act');
    expect(r.filter((a) => a.type === 'act')).toEqual([
      { act_id: '02057_00_multi', title: 'Business Corporations Act', citation: 'SBC 2002, c. 57', type: 'act', source_url: `${DOC}02057_00`, status: 'current' },
    ]);
  });

  it('does not flag a current act just because it carries an official note', async () => {
    const client = new BcClient({
      fetcher: fakeFetcher([
        titleRoute('business corporations act', 'fullsearch-title-business-corporations.xml'),
        [(u) => u.includes('/xpath///act:repealedtext'), '<snippet><act:repealedtext xmlns:act="x">[Note: some amounts may not be current.]</act:repealedtext></snippet>'],
        [(u) => u.includes('/xpath//act:act[@status]'), NO_RESULTS],
      ]),
    });
    const [act] = await client.findAct('Business Corporations Act');
    expect(act).toMatchObject({ act_id: '02057_00_multi', status: 'current' });
  });

  it('puts the current act before a replaced act of the same name, and says why', async () => {
    const client = new BcClient({
      fetcher: fakeFetcher([
        titleRoute('local government act', 'fullsearch-title-local-government-act.xml'),
        [
          (u) => u.startsWith(`${DOC}96323b_01/xml/xpath//act:act[@status]`),
          '<snippet><act:act xmlns:act="http://www.gov.bc.ca/2013/legislation/act" id="00_96323b_01" status="Replaced"><act:title>Local Government Act</act:title><act:repealedtext>[Most of the Local Government Act revised under the Statute Revision Act, effective January 1, 2016.]</act:repealedtext></act:act></snippet>',
        ],
        [(u) => u.includes('/xpath//act:act[@status]'), NO_RESULTS],
      ]),
    });
    const r = await client.findAct('Local Government Act');
    expect(r[0]).toMatchObject({ act_id: 'r15001_00_multi', citation: 'RSBC 2015, c. 1', status: 'current' });
    expect(r.find((a) => a.act_id === '96323b_01')).toMatchObject({ status: 'repealed or replaced', note: expect.stringContaining('Statute Revision Act') });
  });
});

describe('BcClient.search (two steps: full-site search, then in-document search)', () => {
  const searchRoutes = (fullsearch: string, inDocEsa: string): Route[] => [
    [(u) => u.includes('/search/complete/fullsearch?'), fx(fullsearch)],
    [(u) => u.startsWith(`${DOC}96113_01/xml/search/`), fx(inDocEsa)],
    [(u) => u === `${DOC}96113_01`, fx('page-96113_01.head.html')],
  ];

  it('puts s.40 in the top 3 for overtime, with citation fields and a snippet', async () => {
    const client = new BcClient({ fetcher: fakeFetcher(searchRoutes('fullsearch-overtime.xml', 'insearch-96113_01-overtime.xml')) });
    const r = await client.search('overtime', 10);
    const top3 = r.results.slice(0, 3).map((x) => `${x.act_id}/${x.section}`);
    expect(top3).toContain('96113_01/40');
    const s40 = r.results.find((x) => x.section === '40')!;
    expect(s40).toMatchObject({
      jurisdiction: 'bc',
      act_title: 'Employment Standards Act',
      act_citation: 'RSBC 1996, c. 113',
      source_url: `${DOC}96113_01#section40`,
      current_to: '2026-09-15',
    });
    expect(s40.snippet).toContain('**overtime**');
    expect(r.notice).toBe(BC_LAWS_NOTICE);
  });

  it('ranks the section that defines the searched term first', async () => {
    const client = new BcClient({ fetcher: fakeFetcher(searchRoutes('fullsearch-statutory-holiday.xml', 'insearch-96113_01-statutory-holiday.xml')) });
    const r = await client.search('"statutory holiday"', 10);
    expect(r.results[0]).toMatchObject({ act_id: '96113_01', section: '1' });
    expect(r.results[0].match).toContain('defines the term');
  });

  it('reports a failed in-document search as a warning instead of silently treating it as no hits', async () => {
    const client = new BcClient({ fetcher: fakeFetcher(searchRoutes('fullsearch-overtime.xml', 'insearch-96113_01-overtime.xml')) });
    const r = await client.search('overtime', 10);
    expect(r.warnings.some((w) => /Pay Transparency Regulation/.test(w) && /500/.test(w))).toBe(true);
  });

  it('only searches current documents, acts first (no point-in-time, TLC or historical tables)', async () => {
    const fetcher = fakeFetcher(searchRoutes('fullsearch-overtime.xml', 'insearch-96113_01-overtime.xml'));
    await new BcClient({ fetcher }).search('overtime', 10);
    const searchedIds = fetcher.calls
      .filter((u) => u.includes('/xml/search/'))
      .map((u) => u.slice(DOC.length).split('/')[0]);
    // the 15 hits for "overtime" hold 1 current act and 6 current regulations; the other 8 are point-in-time versions
    expect(searchedIds).toEqual(['96113_01', '225_2023', '396_95', '60_2021', '124_95', '38_2005', '169_2009_01']);
  });

  // D3 run 3 (2026-09-26): two answers explained s.44 from its snippet, which stops at "worked under an…", and made up the rest.
  it('says that snippets are cut short, so a section must be read in full before it is quoted or explained', async () => {
    const client = new BcClient({ fetcher: fakeFetcher(searchRoutes('fullsearch-overtime.xml', 'insearch-96113_01-overtime.xml')) });
    const r = await client.search('overtime', 10);
    const note = r.notes.find((n) => /cut short/.test(n));
    expect(note).toMatch(/get_section/);
    expect(note).toMatch(/section command/);
  });

  it('asks BC Laws for at most 20 documents and wraps the query in parentheses', async () => {
    const fetcher = fakeFetcher(searchRoutes('fullsearch-overtime.xml', 'insearch-96113_01-overtime.xml'));
    await new BcClient({ fetcher }).search('"meal break" OR "meal breaks"', 10);
    const full = decodeURIComponent(fetcher.calls.find((u) => u.includes('fullsearch'))!);
    expect(full).toContain('q=("meal break" OR "meal breaks")');
    expect(full).toMatch(/[?&]s=0&e=20(&|$)/);
  });
});
