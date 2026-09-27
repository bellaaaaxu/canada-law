import { describe, expect, it } from 'vitest';
import { FEDERAL_NOTICE } from '../src/notice.js';
import { FederalClient, parsePhrases } from '../src/sources/federal.js';
import { ToolError } from '../src/tool-error.js';
import { FED, FETCHED_AT, fakeFetcher, fedRoutes, fx, type Route } from './helpers.js';

const client = (extra: Route[] = []) => {
  const fetcher = fakeFetcher([...extra, ...fedRoutes]);
  return { fetcher, fed: new FederalClient({ fetcher }) };
};
const xmlRoute = (id: string, body: string): Route => [(u) => u === `${FED}/eng/XML/${id}.xml`, body];
// The Canada Labour Standards Regulations with a schedule inside the body whose item is numbered 1, as SOR/86-304 has.
const CLSR_WITH_SCHEDULE_ITEM = fx('fed-CRC-986-trimmed.xml').replace(
  '</Body>',
  '<Schedule><ScheduleFormHeading><Label>SCHEDULE V</Label><OriginatingRef>(Subsection 16.12(1))</OriginatingRef><TitleText>Subjects to Be Included in the Courses</TitleText></ScheduleFormHeading><RegulationPiece><Section><Label>1</Label><Text>Basic first aid:</Text></Section></RegulationPiece></Schedule></Body>',
);
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

  it('notes amendments not in force that name no section, since one of them could still touch this section', async () => {
    const heading =
      '<RelatedOrNotInForce><Heading level="5" style="nifrp"><TitleText> — 2018, c. 27, s. 451</TitleText></Heading><Section type="amending"><Label>451</Label><Text>The heading of Division III of Part III of the Act is replaced by the following:</Text></Section></RelatedOrNotInForce>';
    const xml = fx('fed-L-2-trimmed.xml').replace(/<\/BillPiece><\/Schedule>(?![\s\S]*<\/BillPiece><\/Schedule>)/, `${heading}</BillPiece></Schedule>`);
    const r = await client([xmlRoute('L-2', xml)]).fed.getSection('L-2', '169.1');
    expect(r.notes?.join(' ')).toMatch(/1 amendment not in force .*names no particular section/);
    expect((await client().fed.getSection('L-2', '169.1')).notes).toBeUndefined();
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

  it('says so when a whole section is not in force (in-force="no" on the section)', async () => {
    const xml = fx('fed-L-2-trimmed.xml').replace(/<Section([^>]*)>(<MarginalNote[^>]*>Break<\/MarginalNote>)/, '<Section$1 in-force="no">$2');
    const r = await client([xmlRoute('L-2', xml)]).fed.getSection('L-2', '169.1');
    expect(r.warnings.join(' ')).toMatch(/Section 169\.1 is not in force yet/);
  });

  it('says when a number is an item of a schedule, and links to the table of contents', async () => {
    const r = await client([xmlRoute('C.R.C.,_c._986', CLSR_WITH_SCHEDULE_ITEM)]).fed.getSection('C.R.C.,_c._986', '1');
    const item = [r, ...(r.other_matches ?? [])].find((m) => m.location.some((l) => l.startsWith('SCHEDULE V')))!;
    expect(item.citation.source_url).toBe(`${FED}/eng/regulations/C.R.C.,_c._986/index.html`);
    expect(r.warnings.join(' ')).toMatch(/item of SCHEDULE V/);
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

  it('reads a range as the table of contents prints it ("163 to 165")', async () => {
    const r = await client().fed.getSection('L-2', '163 to 165');
    expect(r.text).toBe('163 to 165 [Repealed, R.S., 1985, c. 9 (1st Supp.), s. 4]');
  });

  it('points to the right jurisdiction when given a BC act_id', async () => {
    const r404: Route = [(u) => u === `${FED}/eng/XML/96113_01.xml`, { status: 404, body: 'Page not Found' }];
    await expect(client([r404]).fed.getSection('96113_01', '40')).rejects.toThrow(/looks like a BC act_id.*"bc"/);
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

describe('parsePhrases (reading a query the way people and AI models write it)', () => {
  it('takes quoted phrases with or without OR, in any case, and drops parentheses', () => {
    expect(parsePhrases('"general holiday" OR "general holidays"').phrases).toEqual(['general holiday', 'general holidays']);
    expect(parsePhrases('"general holiday" "general holidays"').phrases).toEqual(['general holiday', 'general holidays']);
    expect(parsePhrases('"general holiday" or "general holidays"').phrases).toEqual(['general holiday', 'general holidays']);
    expect(parsePhrases('("meal break" OR "meal breaks")').phrases).toEqual(['meal break', 'meal breaks']);
  });

  it('keeps unquoted words together as one phrase, and a quoted phrase whole even when it holds OR', () => {
    expect(parsePhrases('overtime pay').phrases).toEqual(['overtime pay']);
    expect(parsePhrases('overtime OR "time off"').phrases).toEqual(['time off', 'overtime']);
    expect(parsePhrases('"leave OR absence"').phrases).toEqual(['leave OR absence']);
  });

  it('treats AND as OR, and says so', () => {
    expect(parsePhrases('overtime AND bank')).toEqual({ phrases: ['overtime', 'bank'], and: true });
    expect(parsePhrases('overtime').and).toBe(false);
  });

  it('leaves "and" / "or" inside unquoted wording alone, as statutes use them ("health and safety committee")', () => {
    expect(parsePhrases('health and safety committee')).toEqual({ phrases: ['health and safety committee'], and: false });
    expect(parsePhrases('wages and/or benefits').phrases).toEqual(['wages and/or benefits']);
  });

  it('takes curly and single quotes as quotes', () => {
    expect(parsePhrases('“general holiday” OR “general holidays”').phrases).toEqual(['general holiday', 'general holidays']);
    expect(parsePhrases("'general holiday'").phrases).toEqual(['general holiday']);
  });
});

describe('FederalClient.search (the Canada Labour Code and its regulations, in memory)', () => {
  it('finds phrases written without OR (as some models write them)', async () => {
    const r = await client().fed.search('"general holiday" "general holidays"');
    expect(r.results[0]).toMatchObject({ act_id: 'L-2', section: '166' });
  });

  it('says that finding nothing does not show the law has no such rule', async () => {
    const r = await client().fed.search('"zebra crossing guard"');
    expect(r.results).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/No section .* matched .*does not show that the law has no such rule/);
  });

  it('says when AND was searched as OR', async () => {
    const r = await client().fed.search('overtime AND holiday');
    expect(r.notes.join(' ')).toMatch(/AND .*OR/);
  });

  it('rejects a phrase with no letters or digits, such as a lone *', async () => {
    await expect(client().fed.search('*')).rejects.toBeInstanceOf(ToolError);
    await expect(client().fed.search('"general holiday" OR *')).rejects.toBeInstanceOf(ToolError);
  });

  const at = (results: { act_id: string; section: string }[], id: string, num: string) => results.findIndex((x) => x.act_id === id && x.section === num) + 1;

  it('ranks the section that defines "general holiday" first, with citation fields and a marked snippet', async () => {
    const r = await client().fed.search('"general holiday" OR "general holidays"');
    expect(r.results[0]).toMatchObject({
      jurisdiction: 'federal',
      act_title: 'Canada Labour Code',
      act_citation: 'R.S.C., 1985, c. L-2',
      act_id: 'L-2',
      section: '166',
      heading: 'Definitions',
      source_url: `${FED}/eng/acts/L-2/section-166.html`,
      current_to: '2026-09-03',
      retrieved_at: FETCHED_AT,
    });
    expect(r.results[0].match).toContain('defines the term');
    expect(r.results[0].snippet).toContain('"**general holiday**" means New Year’s Day');
    expect(at(r.results, 'L-2', '192')).toBeGreaterThan(0);
    expect(r.notice).toBe(FEDERAL_NOTICE);
  });

  it('finds severance pay in s.235, whose only mention of it is the Division heading above it', async () => {
    const r = await client().fed.search('"severance pay"');
    const rank = at(r.results, 'L-2', '235');
    expect(rank).toBeGreaterThan(0);
    expect(rank).toBeLessThanOrEqual(3);
    const s235 = r.results[rank - 1];
    expect(s235.match).toContain('heading above the section');
    expect(s235.snippet.startsWith('[DIVISION XI — **Severance Pay**] 235 (1) An employer who terminates')).toBe(true);
  });

  it('puts s.174 in the top 3 for overtime', async () => {
    const rank = at((await client().fed.search('overtime')).results, 'L-2', '174');
    expect(rank).toBeGreaterThan(0);
    expect(rank).toBeLessThanOrEqual(3);
  });

  it('takes a wildcard at the end of a word, and matches ’ and \' alike', async () => {
    expect(at((await client().fed.search('break*')).results, 'L-2', '169.1')).toBeGreaterThan(0);
    expect((await client().fed.search("\"employers' organization\"")).results.some((x) => x.section === '166')).toBe(true);
  });

  it('searches the Code and the regulations the official list puts under it, and nothing else', async () => {
    const { fed, fetcher } = client([xmlRoute('E-5.6', '<Statute/>')]);
    const r = await fed.search('"break" OR "breaks"', 20);
    expect(fetcher.calls).toEqual(expect.arrayContaining([`${FED}/eng/XML/L-2.xml`, `${FED}/eng/XML/C.R.C.,_c._986.xml`, `${FED}/eng/XML/SOR-2021-200.xml`]));
    expect(fetcher.calls).not.toContain(`${FED}/eng/XML/E-5.6.xml`);
    expect(r.documents_searched).toBe(3);
    expect(r.results.some((x) => x.act_id === 'SOR-2021-200')).toBe(true);
    for (const n of ['438', '2178', '154.1', '177.2', '312']) expect(r.results.some((x) => x.act_id === 'L-2' && x.section === n), n).toBe(false);
  });

  it('searches the Code alone, and says so, when the official list cannot be read', async () => {
    const { fed, fetcher } = client([[(u) => u === `${FED}/eng/XML/Legis.xml`, { status: 500, body: 'error' }]]);
    const r = await fed.search('overtime');
    expect(fetcher.calls).not.toContain(`${FED}/eng/XML/C.R.C.,_c._986.xml`);
    expect(r.documents_searched).toBe(1);
    expect(r.warnings.join(' ')).toMatch(/official list .*could not be read.*only the Canada Labour Code/);
  });

  it('does not trust an official list that came back as something else (a web page, a new format)', async () => {
    const page: Route = [(u) => u === `${FED}/eng/XML/Legis.xml`, '<html><body>Service temporarily unavailable</body></html>'];
    const r = await client([page]).fed.search('overtime');
    expect(r.documents_searched).toBe(1);
    expect(r.warnings.join(' ')).toMatch(/official list .*could not be read.*only the Canada Labour Code/);
    await expect(client([page]).fed.findAct('Canada Labour Code')).rejects.toThrow(/official list/);
  });

  it('says when a regulation the list puts under the Code is missing from the list', async () => {
    const legis = fx('fed-legis-trimmed.xml').replace('<Reg idRef="1315618e" />', '<Reg idRef="1315618e" /><Reg idRef="999999e" />');
    const r = await client([[(u) => u === `${FED}/eng/XML/Legis.xml`, legis]]).fed.search('overtime');
    expect(r.warnings.join(' ')).toMatch(/1 regulation the official list puts under the Canada Labour Code is not in the list itself/);
    expect(r.documents_searched).toBe(3);
  });

  it('says when the list names no regulations under the Code', async () => {
    const legis = fx('fed-legis-trimmed.xml').replace(/<RegsMadeUnderAct><Reg idRef="602863e" \/><Reg idRef="1315618e" \/><\/RegsMadeUnderAct>/, '');
    const r = await client([[(u) => u === `${FED}/eng/XML/Legis.xml`, legis]]).fed.search('overtime');
    expect(r.warnings.join(' ')).toMatch(/names no regulations under the Canada Labour Code/);
    expect(r.documents_searched).toBe(1);
  });

  it('does not count a document that came back as something other than legislation XML', async () => {
    const r = await client([xmlRoute('C.R.C.,_c._986', '<html><body>Maintenance</body></html>')]).fed.search('overtime');
    expect(r.warnings.join(' ')).toMatch(/Canada Labour Standards Regulations \(C\.R\.C\.,_c\._986\) did not come back as legislation XML/);
    expect(r.documents_searched).toBe(2);
  });

  it('says so when the Code comes back with no sections, and does not count it', async () => {
    const empty = '<?xml version="1.0"?><Statute><Identification><ShortTitle>Canada Labour Code</ShortTitle></Identification><Body></Body></Statute>';
    const r = await client([xmlRoute('L-2', empty)]).fed.search('overtime');
    expect(r.warnings.join(' ')).toMatch(/Canada Labour Code \(L-2\) came back with no sections/);
    expect(r.documents_searched).toBe(2);
  });

  it('keeps searching the others when one document cannot even be parsed (a download cut short)', async () => {
    const cut = fx('fed-CRC-986-trimmed.xml').slice(0, fx('fed-CRC-986-trimmed.xml').indexOf('<Body') + 1); // ends with "<"
    const r = await client([xmlRoute('C.R.C.,_c._986', cut)]).fed.search('overtime');
    expect(r.warnings.join(' ')).toMatch(/Canada Labour Standards Regulations \(C\.R\.C\.,_c\._986\) did not come back as legislation XML/);
    expect(r.results.some((x) => x.section === '174')).toBe(true);
    await expect(client([xmlRoute('C.R.C.,_c._986', cut)]).fed.getSection('C.R.C.,_c._986', '2')).rejects.toThrow(/did not come back as legislation XML/);
  });

  it('flags a result that is not in force yet', async () => {
    const xml = fx('fed-L-2-trimmed.xml').replace(/<Section([^>]*)>(<MarginalNote[^>]*>Break<\/MarginalNote>)/, '<Section$1 in-force="no">$2');
    const r = await client([xmlRoute('L-2', xml)]).fed.search('break');
    expect(r.results.find((x) => x.section === '169.1')?.match).toContain('not in force yet');
    expect(r.warnings.join(' ')).toMatch(/169\.1 .*not in force yet/);
  });

  it('marks a schedule item in the results, with the table of contents as its link', async () => {
    const r = await client([xmlRoute('C.R.C.,_c._986', CLSR_WITH_SCHEDULE_ITEM)]).fed.search('"basic first aid"');
    const item = r.results.find((x) => x.act_id === 'C.R.C.,_c._986' && x.section === '1')!;
    expect(item).toMatchObject({ source_url: `${FED}/eng/regulations/C.R.C.,_c._986/index.html`, schedule: 'SCHEDULE V (Subsection 16.12(1)) Subjects to Be Included in the Courses' });
    expect(item.match).toContain('in a schedule');
  });

  it('reports a regulation it could not read, and still searches the rest', async () => {
    const r = await client([[(u) => u === `${FED}/eng/XML/C.R.C.,_c._986.xml`, { status: 500, body: 'error' }]]).fed.search('overtime');
    expect(r.warnings.join(' ')).toMatch(/Canada Labour Standards Regulations \(C\.R\.C\.,_c\._986\).*HTTP 500/);
    expect(r.results.some((x) => x.section === '174')).toBe(true);
  });

  it('says what it searched, that matching is literal, and that snippets are cut short', async () => {
    const r = await client().fed.search('overtime');
    const notes = r.notes.join(' ');
    expect(notes).toMatch(/the Canada Labour Code and the 2 regulations made under it/);
    expect(notes).toMatch(/find_act/);
    expect(notes).toMatch(/literal/);
    expect(notes).toMatch(/cut short/);
  });

  it('rejects an empty query', async () => {
    await expect(client().fed.search(' "" ')).rejects.toBeInstanceOf(ToolError);
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

  it('says why a citation is missing when the official page cannot be read', async () => {
    const [act] = await client([[(u) => u === `${FED}/eng/acts/L-2/index.html`, { status: 500, body: 'error' }]]).fed.findAct('Canada Labour Code');
    expect(act).toMatchObject({ act_id: 'L-2', citation: '', note: expect.stringMatching(/official page could not be read/) });
  });

  it('rejects an empty name', async () => {
    await expect(client().fed.findAct('  ')).rejects.toBeInstanceOf(ToolError);
  });
});
