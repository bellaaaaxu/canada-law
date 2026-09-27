import { describe, expect, it } from 'vitest';
import { FEDERAL_NOTICE } from '../src/notice.js';
import { FederalClient } from '../src/sources/federal.js';
import { ToolError } from '../src/tool-error.js';
import { FED, FETCHED_AT, fakeFetcher, fedRoutes, fx, type Route } from './helpers.js';

const client = (extra: Route[] = []) => {
  const fetcher = fakeFetcher([...extra, ...fedRoutes]);
  return { fetcher, fed: new FederalClient({ fetcher }) };
};
const xmlRoute = (id: string, body: string): Route => [(u) => u === `${FED}/eng/XML/${id}.xml`, body];
const pageRoute = (id: string, body: string): Route => [(u) => u === `${FED}/eng/acts/${id}/index.html`, body];

describe('Justice Laws licence notice', () => {
  it('says where the text comes from, under which order, and that it is not an official version', () => {
    expect(FEDERAL_NOTICE).toContain('Justice Laws Website (https://laws-lois.justice.gc.ca)');
    expect(FEDERAL_NOTICE).toContain('Reproduction of Federal Law Order (SI/97-5)');
    expect(FEDERAL_NOTICE).toContain('NOT AN OFFICIAL VERSION');
  });
});

describe('FederalClient.getSection', () => {
  it('returns s.169.1 of the Canada Labour Code with the full citation contract', async () => {
    const r = await client().fed.getSection('L-2', '169.1');
    expect(r.citation).toEqual({
      jurisdiction: 'federal',
      act_title: 'Canada Labour Code',
      act_citation: 'R.S.C., 1985, c. L-2',
      act_id: 'L-2',
      section: '169.1',
      heading: 'Break',
      source_url: `${FED}/eng/acts/L-2/section-169.1.html`,
      current_to: '2026-09-03',
      retrieved_at: FETCHED_AT,
    });
    expect(r.location).toEqual(['PART III — Standard Hours, Wages, Vacations and Holidays', 'DIVISION I — Hours of Work']);
    expect(r.text.startsWith('169.1 (1) Every employee is entitled to and shall be granted an unpaid break')).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.notice).toBe(FEDERAL_NOTICE);
  });

  it('reads a regulation, written the way people write its id', async () => {
    const r = await client().fed.getSection('C.R.C., c. 986', '15');
    expect(r.citation).toMatchObject({
      act_id: 'C.R.C.,_c._986',
      act_title: 'Canada Labour Standards Regulations',
      act_citation: 'C.R.C., c. 986',
      source_url: `${FED}/eng/regulations/C.R.C.,_c._986/section-15.html`,
      current_to: '2026-09-03',
    });
  });

  it('returns current_to null with a warning when the official page shows no date', async () => {
    const r = await client([pageRoute('L-2', '<html><h1>Canada Labour Code</h1></html>')]).fed.getSection('L-2', '169.1');
    expect(r.citation.current_to).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/current_to/);
  });

  it('warns when the official page and the XML are different versions (last amended dates differ)', async () => {
    const newer = fx('fed-page-L-2.head.html').replace('</a> on 2025-12-12', '</a> on 2026-08-01');
    const r = await client([pageRoute('L-2', newer)]).fed.getSection('L-2', '169.1');
    expect(r.warnings.join(' ')).toMatch(/last amended on 2026-08-01.*2025-12-12/);
  });

  it('says when an amendment not in force yet would change the section', async () => {
    const r = await client().fed.getSection('L-2', '206.1');
    expect(r.warnings.join(' ')).toMatch(/not in force yet.*2018, c\. 27, s\. 312/);
  });

  it('finds a number inside a range of repealed sections, and links to the table of contents', async () => {
    const r = await client().fed.getSection('L-2', '164');
    expect(r.citation.source_url).toBe(`${FED}/eng/acts/L-2/index.html`);
    expect(r.text).toBe('163 to 165 [Repealed, R.S., 1985, c. 9 (1st Supp.), s. 4]');
    expect(r.warnings.join(' ')).toMatch(/163 to 165/);
  });

  it('returns a repealed section as it reads, with a warning', async () => {
    const r = await client().fed.getSection('L-2', '247.1');
    expect(r.text).toBe('247.1 [Repealed, 2018, c. 22, s. 16]');
    expect(r.warnings.join(' ')).toMatch(/repealed/i);
  });

  it('warns about a part that is not in force (in-force="no")', async () => {
    const xml = fx('fed-L-2-trimmed.xml').replace(/(<Label>169\.1<\/Label>[\s\S]*?)<Subsection([^>]*)>(<MarginalNote[^>]*>Exception)/, '$1<Subsection$2 in-force="no">$3');
    const r = await client([xmlRoute('L-2', xml)]).fed.getSection('L-2', '169.1');
    expect(r.warnings.join(' ')).toMatch(/not in force/i);
  });

  it('says clearly when a section does not exist, and points to get_toc', async () => {
    await expect(client().fed.getSection('L-2', '999')).rejects.toThrow(/No section 999 .*get_toc/);
  });

  it('says that a section only an amendment not in force would add is not in force, instead of "no section"', async () => {
    await expect(client().fed.getSection('L-2', '177.2')).rejects.toThrow(/177\.2.*not in force.*\d{4}, c\. \d+/);
  });

  it('refuses an act whose every section is repealed', async () => {
    await expect(client([xmlRoute('C-49', fx('fed-C-49.xml'))]).fed.getSection('C-49', '1')).rejects.toThrow(/Advance Payments for Crops Act.*repealed/i);
  });

  it('rejects an id that could leave the XML folder, before asking Justice Laws', async () => {
    const { fed, fetcher } = client();
    await expect(fed.getSection('../etc', '1')).rejects.toBeInstanceOf(ToolError);
    expect(fetcher.calls).toHaveLength(0);
  });

  it('says so when Justice Laws has no such act', async () => {
    const r404: Route = [(u) => u === `${FED}/eng/XML/NOPE-1.xml`, { status: 404, body: 'Page not Found' }];
    await expect(client([r404]).fed.getSection('NOPE-1', '1')).rejects.toThrow(/No federal act or regulation with act_id "NOPE-1"/);
  });
});

describe('FederalClient.getToc', () => {
  it('returns the outline with act-level citation facts', async () => {
    const r = await client().fed.getToc('L-2');
    expect(r.act).toEqual({
      jurisdiction: 'federal',
      act_title: 'Canada Labour Code',
      act_citation: 'R.S.C., 1985, c. L-2',
      act_id: 'L-2',
      source_url: `${FED}/eng/acts/L-2/index.html`,
      current_to: '2026-09-03',
      retrieved_at: FETCHED_AT,
    });
    expect(r.outline).toContain('DIVISION V — General Holidays\n    191  Definitions');
    expect(r.notes.join(' ')).toMatch(/3 amendments not in force/);
    expect(r.notice).toBe(FEDERAL_NOTICE);
  });
});

describe('FederalClient.findAct (the official list)', () => {
  it('finds the act by its exact title, with the citation from its official page', async () => {
    const { fed, fetcher } = client();
    const r = await fed.findAct('Canada Labour Code');
    expect(r[0]).toEqual({ act_id: 'L-2', title: 'Canada Labour Code', citation: 'R.S.C., 1985, c. L-2', type: 'act', source_url: `${FED}/eng/acts/L-2/index.html` });
    expect(fetcher.calls).toContain(`${FED}/eng/acts/L-2/index.html`);
  });

  it('finds regulations by the words in their title, acts first', async () => {
    const r = await client().fed.findAct('labour standards');
    expect(r.find((a) => a.act_id === 'C.R.C.,_c._986')).toMatchObject({ type: 'regulation', title: 'Canada Labour Standards Regulations', citation: 'C.R.C., c. 986' });
  });

  it('searches English titles only, and returns nothing rather than guessing', async () => {
    expect(await client().fed.findAct('Code canadien du travail')).toEqual([]);
    expect(await client().fed.findAct('Ontario Employment Standards')).toEqual([]);
  });

  it('rejects an empty name', async () => {
    await expect(client().fed.findAct('  ')).rejects.toBeInstanceOf(ToolError);
  });
});
