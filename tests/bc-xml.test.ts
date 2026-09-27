import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeHitSections,
  buildToc,
  docInfo,
  findSections,
  parseXml,
  renderSection,
  renderToc,
} from '../src/sources/bc-xml.js';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const esa = parseXml(fx('doc-96113_01.xml'));
const esr = parseXml(fx('doc-396_95.xml'));
const bca = parseXml(fx('doc-02057_00_multi-trimmed.xml'));

describe('findSections', () => {
  it('finds ESA s.40 with its marginal note and Part', () => {
    const [m, ...rest] = findSections(esa, '40');
    expect(rest).toHaveLength(0);
    expect(m.num).toBe('40');
    expect(m.heading).toBe('Overtime wages for employees not working under an averaging agreement');
    expect(m.location).toEqual(['Part 4 — Hours of Work and Overtime']);
  });

  it('returns nothing for a section number that does not exist', () => {
    expect(findSections(esa, '999')).toEqual([]);
  });

  it('matches the number exactly (52.1 is not 52.11 or 52.121)', () => {
    const found = findSections(esa, '52.1');
    expect(found.map((m) => m.num)).toEqual(['52.1']);
  });

  it('knows which part document of a multi-document act a section lives in', () => {
    const [m] = findSections(bca, '10');
    expect(m.heading).toBe('Formation of company');
    expect(m.partDocId).toBe('02057_02');
  });
});

describe('renderSection', () => {
  const text = (doc: ReturnType<typeof parseXml>, num: string) => renderSection(findSections(doc, num)[0].node);

  it('lays out s.40 the way the official page does', () => {
    expect(text(esa, '40')).toBe(
      [
        "40 (1) An employer must pay an employee who works over 8 hours a day, and is not working under an averaging agreement under section 37,",
        "  (a) 1 1/2 times the employee's regular wage for the time over 8 hours, and",
        "  (b) double the employee's regular wage for any time over 12 hours.",
        "(2) An employer must pay an employee who works over 40 hours a week, and is not working under an averaging agreement under section 37, 1 1/2 times the employee's regular wage for the time over 40 hours.",
        '(3) For the purpose of calculating weekly overtime under subsection (2), only the first 8 hours worked by an employee in each day are counted, no matter how long the employee works on any day of the week.',
        '(4) [Repealed 2002-42-19.]',
      ].join('\n'),
    );
  });

  it('puts a section without subsections on one line', () => {
    expect(text(esa, '41')).toBe('41 [Repealed 2002-42-20.]');
  });

  it('quotes defined terms and indents definitions and their paragraphs', () => {
    const s1 = text(esa, '1');
    expect(s1.startsWith('1 (1) In this Act:\n  "assignment of wages" includes a written authorization')).toBe(true);
    expect(s1).toContain(
      [
        '  "day" means',
        '    (a) a 24 hour period ending at midnight, or',
        "    (b) in relation to an employee's shift that continues over midnight, the 24 hour period beginning at the start of the employee's shift;",
      ].join('\n'),
    );
    expect(s1).toContain(
      "  \"statutory holiday\" means New Year's Day, Family Day, Good Friday, Victoria Day, Canada Day, British Columbia Day, Labour Day, National Day for Truth and Reconciliation, Thanksgiving Day, Remembrance Day, Christmas Day and any other holiday prescribed by regulation;",
    );
  });

  it('drops amendment markers without losing the words they wrap', () => {
    expect(text(esa, '1')).toContain('74 (5), 76 (2), (3) or (8), 79, 80 (3), 100 or 119;');
  });

  it('keeps a regulation history note on its own line', () => {
    expect(text(esr, '1')).toMatch(/\n\[am\. B\.C\. Regs\. 44\/97, s\. \(a\); 358\/97.*140\/2024, Sch\., s\. 1\.\]$/);
  });

  it('turns character elements into the characters the official page shows', () => {
    const all = findSections(bca, '23').map((m) => renderSection(m.node)).join('\n');
    expect(all).toContain('"Limitée"');
  });
});

describe('buildToc / renderToc', () => {
  const toc = buildToc(esa);

  it('lists the 14 parts of the ESA', () => {
    const parts = toc.filter((e) => e.kind === 'part');
    expect(parts).toHaveLength(14);
    expect(parts[3]).toMatchObject({ num: '4', title: 'Hours of Work and Overtime' });
  });

  it('keeps sections in order under their part, including a trailing repealed range', () => {
    const outline = renderToc(toc);
    expect(outline).toContain(
      'Part 4 — Hours of Work and Overtime\n  31  Repealed\n  32  Meal breaks',
    );
    expect(outline).toContain('  40  Overtime wages for employees not working under an averaging agreement');
    expect(outline.trimEnd().endsWith('128-129  Repealed')).toBe(true);
  });

  it('records the part document for sections of a multi-document act', () => {
    const s10 = buildToc(bca).find((e) => e.kind === 'section' && e.num === '10');
    expect(s10?.partDocId).toBe('02057_02');
  });
});

describe('docInfo', () => {
  it('reads an act title', () => {
    expect(docInfo(esa)).toMatchObject({ kind: 'act', title: 'Employment Standards Act', repealedText: null });
  });

  it('reads a regulation title and number', () => {
    expect(docInfo(esr)).toMatchObject({ kind: 'regulation', title: 'Employment Standards Regulation', regnum: '396/95' });
  });

  it('reports a replaced act and why', () => {
    const stub = parseXml(
      '<?xml version="1.0" encoding="UTF-8"?><act:act xmlns:act="http://www.gov.bc.ca/2013/legislation/act" xmlns:in="http://www.qp.gov.bc.ca/2013/inline" status="Replaced" id="96492_00"><act:title titleOverride="Workers Compensation Act [RSBC 1996] c. 492">Workers Compensation Act</act:title><act:chapter>492</act:chapter><act:yearenacted>1996</act:yearenacted><act:repealedtext>[Revised as the <in:doc>Workers Compensation Act</in:doc>, RS2019, c. 1, effective April 6, 2020 (B.C. Reg. 207/2019).]</act:repealedtext></act:act>',
    );
    expect(docInfo(stub)).toMatchObject({
      kind: 'act',
      status: 'Replaced',
      repealedText: '[Revised as the Workers Compensation Act, RS2019, c. 1, effective April 6, 2020 (B.C. Reg. 207/2019).]',
    });
  });
});

describe('analyzeHitSections (in-document search results)', () => {
  const overtime = analyzeHitSections(parseXml(fx('insearch-96113_01-overtime.xml')));
  const byNum = (list: typeof overtime, n: string) => list.find((s) => s.num === n)!;

  it('returns every section that contains a hit', () => {
    expect(overtime.map((s) => s.num)).toEqual(['1', '3', '17', '27', '35', '37', '40', '42', '45', '49.1', '52.13', '52.5', '72']);
  });

  it('sees that the s.40 heading starts with the search word', () => {
    expect(byNum(overtime, '40')).toMatchObject({ headingHit: true, headingStartsWithHit: true, totalHits: 2 });
    expect(byNum(overtime, '42')).toMatchObject({ headingHit: true, headingStartsWithHit: false, totalHits: 9 });
  });

  it('tells a full defined term from a longer one', () => {
    expect(byNum(overtime, '1')).toMatchObject({ definedTermExact: false, definedTermPartial: true });
    const holiday = analyzeHitSections(parseXml(fx('insearch-96113_01-statutory-holiday.xml')));
    expect(byNum(holiday, '1')).toMatchObject({ definedTermExact: true });
  });

  it('matches the plural heading when the query includes it', () => {
    const meal = analyzeHitSections(parseXml(fx('insearch-96113_01-meal-break-or.xml')));
    expect(meal).toHaveLength(1);
    expect(meal[0]).toMatchObject({ num: '32', heading: 'Meal breaks', headingHit: true, totalHits: 5 });
  });

  it('builds a snippet around a hit in the body, marking the hit', () => {
    expect(byNum(overtime, '40').snippet).toContain('weekly **overtime** under subsection (2)');
  });

  // D3 run 4 (2026-09-26): the s.44 snippet stopped at "or (b) worked under an…" and answers made up the rest.
  it('gives a short section whole, so no condition is cut off', () => {
    const holiday = analyzeHitSections(parseXml(fx('insearch-96113_01-statutory-holiday.xml')));
    const s44 = byNum(holiday, '44').snippet;
    expect(s44).toMatch(/^44 An employer must comply with section 45 or 46 /);
    expect(s44).toMatch(/\(b\) worked under an averaging agreement under section 37 at any time within that 30 calendar day period\.$/);
  });

  it('cuts a long section to the whole clause around the hit, never mid-sentence', () => {
    const holiday = analyzeHitSections(parseXml(fx('insearch-96113_01-statutory-holiday.xml')));
    expect(byNum(holiday, '1').snippet).toMatch(/^…"\*\*statutory holiday\*\*" means New Year's Day, .* and any other holiday prescribed by regulation;…$/);
    expect(byNum(overtime, '40').snippet).toMatch(/on any day of the week\.…?$/);
  });
});
